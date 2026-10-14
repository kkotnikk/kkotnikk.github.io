CREATE TABLE `invites` (
	`email` text NOT NULL,
	`course` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`email`, `course`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`module` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `setup` (
	`key` text PRIMARY KEY NOT NULL
);
