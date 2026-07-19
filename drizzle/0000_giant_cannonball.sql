CREATE TABLE `camera_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`offer` text,
	`answer` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
