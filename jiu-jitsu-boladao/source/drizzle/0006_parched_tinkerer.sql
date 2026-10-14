CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`provider_order_id` text,
	`checkout_url` text,
	`status` text DEFAULT 'creating' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_provider_order_id_unique` ON `orders` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `orders_account_status_idx` ON `orders` (`account_id`,`status`);