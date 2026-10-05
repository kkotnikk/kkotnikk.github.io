'use strict';
const html = document.documentElement;
html.classList.add('js');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => motionPreference.matches;
if (!reducedMotion() && !document.hidden) html.classList.add('soft-pending');
const softOut = 'cubic-bezier(.2,.8,.2,1)';
const softPanel = 'cubic-bezier(.22,1,.36,1)';
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#nav');
function closeMenu() { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Abrir menu'); }
toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu'); nav.classList.toggle('open', open); });
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });

// Play the curtain on each page load; skip, hidden-tab and timeout paths always unlock the page.
const intro = document.querySelector('#soft-intro');
const siteContent = document.querySelector('#site-content');
const skipIntro = document.querySelector('.intro-skip');
let introDone = false;
let revealObserver;
let introTimer;
let curtainTimer;
function revealSections() {
 const sections = document.querySelectorAll('.reveal');
 document.querySelectorAll('.food-card').forEach((card, index) => card.style.setProperty('--reveal-delay', `${index * 100}ms`));
 if ('IntersectionObserver' in window && !reducedMotion()) {
  revealObserver = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); } }); }, { threshold: 0.06 });
  sections.forEach(section => revealObserver.observe(section));
 } else { sections.forEach(section => section.classList.add('visible')); }
}
function completeIntro() {
 if (introDone) return;
 introDone = true;
 clearTimeout(introTimer); clearTimeout(curtainTimer);
 const restoreFocus = document.activeElement === skipIntro;
 intro.hidden = true;
 siteContent.inert = false;
 html.classList.remove('soft-pending', 'intro-active');
 html.classList.add('soft-ready');
 revealSections();
 document.dispatchEvent(new CustomEvent('padoca:ready'));
 if (restoreFocus) document.querySelector('.hero-actions a').focus({ preventScroll: true });
}
function finishIntro(immediate = false) {
 if (introDone) return;
 clearTimeout(introTimer);
 if (immediate || reducedMotion()) { completeIntro(); return; }
 if (intro.classList.contains('leaving')) return;
 // Make the page available visually behind the rising curtain, while still inert.
 html.classList.remove('soft-pending');
 intro.classList.add('leaving');
 curtainTimer = setTimeout(completeIntro, 1000);
}
window.finishPadocaIntro = finishIntro;
intro.addEventListener('transitionend', event => { if (event.target === intro && event.propertyName === 'transform') completeIntro(); });
skipIntro.addEventListener('click', () => finishIntro(true));
document.addEventListener('visibilitychange', () => { html.classList.toggle('motion-paused', document.hidden); if (document.hidden) finishIntro(true); });
if (html.classList.contains('soft-pending') && !reducedMotion() && !document.hidden) {
 intro.hidden = false; siteContent.inert = true; html.classList.add('intro-active');
 introTimer = setTimeout(() => finishIntro(), 1650);
} else { completeIntro(); }

// Cancelable, distance-based anchor scrolling with the sticky header included.
let scrollFrame = 0;
function stopScroll() { cancelAnimationFrame(scrollFrame); scrollFrame = 0; }
const easeInOutCubic = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function scrollToSection(target, hash, updateHistory = true) {
 stopScroll();
 const start = window.scrollY;
 const offset = document.querySelector('.header').getBoundingClientRect().height + 12;
 const destination = Math.max(0, Math.min(start + target.getBoundingClientRect().top - offset, document.documentElement.scrollHeight - window.innerHeight));
 const difference = destination - start;
 if (updateHistory && location.hash !== hash) history.pushState(null, '', hash);
 const focusTarget = () => { const added = !target.hasAttribute('tabindex'); if (added) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); if (added) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true }); };
 if (reducedMotion() || Math.abs(difference) < 2) { window.scrollTo(0, destination); focusTarget(); return; }
 const duration = Math.min(1250, Math.max(650, Math.abs(difference) * 0.45));
 const started = performance.now();
 function frame(now) { const progress = Math.min(1, (now - started) / duration); window.scrollTo(0, start + difference * easeInOutCubic(progress)); if (progress < 1) scrollFrame = requestAnimationFrame(frame); else { scrollFrame = 0; focusTarget(); } }
 scrollFrame = requestAnimationFrame(frame);
}
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; const hash = link.getAttribute('href'); const target = document.getElementById(hash.slice(1)); if (!target) return; event.preventDefault(); closeMenu(); scrollToSection(target, hash); }));
window.addEventListener('wheel', stopScroll, { passive: true });
window.addEventListener('touchstart', stopScroll, { passive: true });
window.addEventListener('popstate', () => { const target = document.getElementById(location.hash.slice(1)); if (target) scrollToSection(target, location.hash, false); });

// Filters retain the previous view while it leaves, then animate the next view and height.
const cards = [...document.querySelectorAll('.food-card')];
const grid = document.querySelector('.food-grid');
let filterRevision = 0;
let filterAnimations = [];
function cancelFilterAnimations() { filterAnimations.forEach(animation => animation.cancel()); filterAnimations = []; }
async function applyFilter(button) {
 const revision = ++filterRevision;
 cancelFilterAnimations();
 document.querySelectorAll('[data-filter]').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); });
 const showMatching = () => { cards.forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; if (!card.hidden) { card.classList.add('visible'); card.style.setProperty('--reveal-delay', '0ms'); } }); };
 if (reducedMotion() || typeof grid.animate !== 'function') { showMatching(); grid.style.removeProperty('height'); return; }
 const oldHeight = grid.getBoundingClientRect().height;
 filterAnimations = cards.filter(card => !card.hidden).map(card => card.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-18px)' }], { duration: 300, easing: softOut, fill: 'both' }));
 await Promise.allSettled(filterAnimations.map(animation => animation.finished));
 if (revision !== filterRevision) return;
 cancelFilterAnimations(); showMatching();
 grid.style.removeProperty('height');
 const newHeight = grid.getBoundingClientRect().height;
 grid.style.height = `${oldHeight}px`;
 const heightAnimation = grid.animate([{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], { duration: 620, easing: softPanel, fill: 'both' });
 filterAnimations = [heightAnimation, ...cards.filter(card => !card.hidden).map((card, index) => card.animate([{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 620, delay: index * 70, easing: softPanel, fill: 'both' }))];
 await Promise.allSettled(filterAnimations.map(animation => animation.finished));
 if (revision !== filterRevision) return;
 grid.style.removeProperty('height'); cancelFilterAnimations();
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => applyFilter(button)));

const products = { pratos: { category: 'PRATOS', title: 'Pratos', description: 'Veja algumas opções para a sua refeição e consulte o cardápio completo, os valores e a disponibilidade.' }, bolos: { category: 'BOLOS', title: 'Bolos da Padoca', description: 'Consulte os sabores, tamanhos e valores disponíveis para escolher o seu bolo.' }, carne: { category: 'LANCHES', title: 'Carne louca', description: 'Um dos destaques da Padoca do Bairro para a sua próxima pausa.' }, caldos: { category: 'SOPAS & CALDOS', title: 'Uma pausa quentinha', description: 'Sopas e caldos fazem parte dos sabores da Padoca. Entre em contato para conhecer as opções do dia.' }, espetinhos: { category: 'CHURRASCO', title: 'Espetinhos', description: 'Conheça mais um dos destaques da casa e consulte as opções disponíveis.' } };
const dialog = document.querySelector('#product-dialog');
const dialogWhatsApp = dialog.querySelector('a[href^="https://wa.me/"]');
const defaultWhatsAppURL = dialogWhatsApp.href;
// Each category owns its photos; empty slots remain intentional placeholders.
const galleryFrame = document.querySelector('.gallery-frame');
const galleryImage = document.querySelector('#gallery-photo');
const galleryPlaceholder = document.querySelector('#gallery-placeholder');
const galleryIcon = document.querySelector('#gallery-placeholder-icon');
const galleryPlaceholderNumber = document.querySelector('#gallery-placeholder-number');
const galleryCaption = document.querySelector('#gallery-caption');
const galleryCounter = document.querySelector('#gallery-counter');
const galleryDots = document.querySelector('.gallery-dots');
const galleryPrevious = document.querySelector('.gallery-prev');
const galleryNext = document.querySelector('.gallery-next');
const galleryViewport = document.querySelector('.gallery-viewport');
const gallerySymbols = { pratos: 'pasta', carne: 'sandwich', caldos: 'soup', espetinhos: 'skewer', bolos: 'cake' };
let galleryProduct = '';
let galleryPhotos = [];
let galleryIndex = 0;
let galleryRevision = 0;
let galleryAnimation;
function stopGallery() { ++galleryRevision; galleryAnimation?.cancel(); galleryAnimation = undefined; }
function updateGalleryControls() {
 galleryPrevious.disabled = galleryNext.disabled = galleryPhotos.length < 2;
 galleryCounter.textContent = `Foto ${galleryIndex + 1} de ${galleryPhotos.length}`;
 galleryDots.querySelectorAll('button').forEach((dot, index) => { if (index === galleryIndex) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
}
const galleryPhotoCache = new Map();
function loadGalleryPhoto(src) {
 if (!src) return Promise.resolve(false);
 if (!galleryPhotoCache.has(src)) {
  const pending = new Promise(resolve => {
   const preload = new Image();
   preload.onload = async () => { try { await preload.decode?.(); } catch {} resolve(true); };
   preload.onerror = () => resolve(false);
   preload.src = src;
  });
  galleryPhotoCache.set(src, pending);
  pending.then(loaded => { if (!loaded) galleryPhotoCache.delete(src); });
 }
 return galleryPhotoCache.get(src);
}
async function renderGallery(direction = 0) {
 stopGallery();
 const revision = galleryRevision;
 const selectedIndex = galleryIndex;
 const photo = galleryPhotos[selectedIndex];
 updateGalleryControls();
 // Keep the current photo visible until its successor has loaded and decoded.
 const loaded = photo.src ? await loadGalleryPhoto(photo.src) : false;
 if (revision !== galleryRevision) return;
 const animated = direction && !reducedMotion() && typeof galleryFrame.animate === 'function';
 if (animated) {
  galleryAnimation = galleryFrame.animate([{ opacity: 1, transform: 'translateX(0) scale(1)' }, { opacity: 0, transform: `translateX(${-direction * 28}px) scale(.985)` }], { duration: 150, easing: softOut, fill: 'both' });
  await galleryAnimation.finished.catch(() => {});
  if (revision !== galleryRevision) return;
 }
 galleryImage.hidden = true;
 galleryImage.removeAttribute('src');
 galleryPlaceholder.hidden = false;
 galleryPlaceholderNumber.textContent = photo.src && !loaded ? 'Foto indisponível no momento' : `Espaço para foto ${String(selectedIndex + 1).padStart(2, '0')}`;
 galleryIcon.setAttribute('href', `#${gallerySymbols[galleryProduct]}`);
 galleryCaption.textContent = photo.caption || products[galleryProduct].title;
 galleryImage.alt = photo.alt || `${products[galleryProduct].title} — foto ${selectedIndex + 1}`;
 galleryImage.onload = () => { if (revision !== galleryRevision || !loaded) return; galleryImage.hidden = false; galleryPlaceholder.hidden = true; };
 galleryImage.onerror = () => { if (revision !== galleryRevision) return; galleryImage.hidden = true; galleryPlaceholder.hidden = false; galleryPlaceholderNumber.textContent = 'Foto indisponível no momento'; };
 if (loaded) { galleryImage.src = photo.src; galleryImage.hidden = false; galleryPlaceholder.hidden = true; }
 galleryAnimation?.cancel(); galleryAnimation = undefined;
 if (animated) {
  galleryAnimation = galleryFrame.animate([{ opacity: 0, transform: `translateX(${direction * 28}px) scale(.985)` }, { opacity: 1, transform: 'translateX(0) scale(1)' }], { duration: 350, easing: softPanel, fill: 'both' });
  await galleryAnimation.finished.catch(() => {});
  if (revision !== galleryRevision) return;
  galleryAnimation.cancel(); galleryAnimation = undefined;
 }
}
function openGallery(productKey) {
 stopGallery(); galleryProduct = productKey; galleryIndex = 0;
 galleryImage.hidden = true; galleryImage.removeAttribute('src'); galleryPlaceholder.hidden = false; galleryCaption.textContent = '';
 galleryPlaceholderNumber.textContent = 'Carregando foto…'; galleryIcon.setAttribute('href', `#${gallerySymbols[productKey]}`);
 const configuredPhotos = window.padocaGalleryPhotos?.[productKey];
 galleryPhotos = Array.isArray(configuredPhotos) && configuredPhotos.length ? configuredPhotos : Array.from({ length: 3 }, () => ({ src: '', alt: '', caption: '' }));
 galleryViewport.classList.toggle('has-photos', galleryPhotos.some(photo => Boolean(photo.src)));
 galleryDots.replaceChildren();
 galleryPhotos.forEach((photo, index) => { const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'gallery-dot'; dot.setAttribute('aria-label', `Ver foto ${index + 1} de ${galleryPhotos.length}`); dot.addEventListener('click', () => { if (index === galleryIndex) return; const direction = index > galleryIndex ? 1 : -1; galleryIndex = index; renderGallery(direction); }); galleryDots.append(dot); });
 renderGallery();
 // Warm the remaining photos of the open gallery before the next click.
 galleryPhotos.forEach(photo => { if (photo.src) loadGalleryPhoto(photo.src); });
}
function moveGallery(step) { if (galleryPhotos.length < 2) return; galleryIndex = (galleryIndex + step + galleryPhotos.length) % galleryPhotos.length; renderGallery(step); }
galleryPrevious.addEventListener('click', () => moveGallery(-1));
galleryNext.addEventListener('click', () => moveGallery(1));
dialog.addEventListener('keydown', event => { if (!dialog.open || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); moveGallery(event.key === 'ArrowLeft' ? -1 : 1); });
let touchStartX;
galleryViewport.addEventListener('pointerdown', event => { touchStartX = event.pointerType === 'touch' ? event.clientX : undefined; });
galleryViewport.addEventListener('pointerup', event => { if (touchStartX === undefined) return; const distance = event.clientX - touchStartX; touchStartX = undefined; if (Math.abs(distance) > 45) moveGallery(distance < 0 ? 1 : -1); });
galleryViewport.addEventListener('pointercancel', () => { touchStartX = undefined; });
let lastProductButton;
let closingDialog = false;
cards.forEach(card => card.addEventListener('click', () => { const product = products[card.dataset.product]; openGallery(card.dataset.product); lastProductButton = card; dialogWhatsApp.href = card.dataset.product === 'bolos' ? 'https://wa.me/5511999147113?text=' + encodeURIComponent('Olá! Vim pelo site da Padoca do Bairro e gostaria de informações sobre os bolos: sabores, tamanhos e valores.') : defaultWhatsAppURL; document.querySelector('#dialog-category').textContent = product.category; document.querySelector('#dialog-title').textContent = product.title; document.querySelector('#dialog-description').textContent = product.description; dialog.showModal(); }));
async function closeDialog() {
 if (!dialog.open || closingDialog) return;
 closingDialog = true;
 if (!reducedMotion() && typeof dialog.animate === 'function') { const animation = dialog.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(15px) scale(.98)' }], { duration: 250, easing: softOut, fill: 'forwards' }); await animation.finished.catch(() => {}); dialog.close(); animation.cancel(); } else { dialog.close(); }
 closingDialog = false;
}
document.querySelector('.dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('click', event => { const box = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) closeDialog(); });
dialog.addEventListener('close', () => { stopGallery(); lastProductButton?.focus({ preventScroll: true }); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); finishIntro(true); } if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopScroll(); });
motionPreference.addEventListener('change', () => { if (reducedMotion()) { if (dialog.open) renderGallery(); finishIntro(true); stopScroll(); ++filterRevision; cancelFilterAnimations(); grid.style.removeProperty('height'); const selected = document.querySelector('[data-filter].active'); if (selected) applyFilter(selected); revealObserver?.disconnect(); document.querySelectorAll('.reveal').forEach(section => section.classList.add('visible')); } });


// One frame per pointer update, with a soft return and no permanent animation loop.
const heroPhoto = document.querySelector('.hero-photo');
if (heroPhoto) {
 let photoFrame = 0;
 let photoPressTimer;
 let photoPosition = { x: 0, y: 0 };
 const clampPhoto = value => Math.max(-1, Math.min(1, value));
 function moveHeroPhoto(event = {}) {
  if (reducedMotion() || document.hidden || siteContent.inert) return;
  const bounds = heroPhoto.getBoundingClientRect();
  const width = bounds.width || bounds.right - bounds.left;
  const height = bounds.height;
  if (!width || !height) return;
  photoPosition = {
   x: clampPhoto(((event.clientX ?? bounds.left + width / 2) - bounds.left) / width * 2 - 1),
   y: clampPhoto(((event.clientY ?? bounds.top + height / 2) - bounds.top) / height * 2 - 1)
  };
  heroPhoto.classList.add('is-photo-active');
  if (photoFrame) return;
  photoFrame = requestAnimationFrame(() => {
   photoFrame = 0;
   heroPhoto.style.setProperty('--hero-photo-x', `${photoPosition.x * 5}px`);
   heroPhoto.style.setProperty('--hero-photo-y', `${photoPosition.y * 5}px`);
   heroPhoto.style.setProperty('--hero-photo-angle', `${photoPosition.x * .35}deg`);
   heroPhoto.style.setProperty('--hero-light-x', `${50 + photoPosition.x * 35}%`);
   heroPhoto.style.setProperty('--hero-light-y', `${50 + photoPosition.y * 35}%`);
  });
 }
 function resetHeroPhoto() {
  if (photoFrame) cancelAnimationFrame(photoFrame);
  photoFrame = 0;
  clearTimeout(photoPressTimer);
  heroPhoto.classList.remove('is-photo-active', 'is-photo-pressed');
  ['--hero-photo-x', '--hero-photo-y', '--hero-photo-angle', '--hero-light-x', '--hero-light-y'].forEach(property => heroPhoto.style.removeProperty(property));
 }
 function pressHeroPhoto(event) {
  moveHeroPhoto(event);
  if (reducedMotion() || document.hidden || siteContent.inert) return;
  clearTimeout(photoPressTimer);
  heroPhoto.classList.add('is-photo-pressed');
  photoPressTimer = setTimeout(() => heroPhoto.classList.remove('is-photo-pressed'), 500);
 }
 heroPhoto.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') moveHeroPhoto(event); });
 heroPhoto.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') moveHeroPhoto(event); });
 heroPhoto.addEventListener('pointerdown', pressHeroPhoto);
 heroPhoto.addEventListener('click', event => { if (event.detail === 0) pressHeroPhoto(); });
 heroPhoto.addEventListener('pointerup', event => { heroPhoto.classList.remove('is-photo-pressed'); if (event.pointerType === 'touch') resetHeroPhoto(); });
 heroPhoto.addEventListener('pointerleave', resetHeroPhoto);
 heroPhoto.addEventListener('pointercancel', resetHeroPhoto);
 heroPhoto.addEventListener('focus', () => moveHeroPhoto());
 heroPhoto.addEventListener('blur', resetHeroPhoto);
 heroPhoto.addEventListener('keydown', event => { if (event.key === 'Escape') resetHeroPhoto(); else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pressHeroPhoto(); } });
 document.addEventListener('visibilitychange', () => { if (document.hidden) resetHeroPhoto(); });
 motionPreference.addEventListener('change', () => { if (reducedMotion()) resetHeroPhoto(); });
}
