CREATE TABLE `server_saved` (
	`key` text PRIMARY KEY,
	`url` text NOT NULL,
	`display_name` text,
	`username` text,
	`password` text,
	`position` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`last_project` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `server_saved_project` (
	`server_key` text NOT NULL,
	`worktree` text NOT NULL,
	`position` integer NOT NULL,
	`expanded` integer DEFAULT true NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `server_saved_project_pk` PRIMARY KEY(`server_key`, `worktree`),
	CONSTRAINT `fk_server_saved_project_server_key_server_saved_key_fk` FOREIGN KEY (`server_key`) REFERENCES `server_saved`(`key`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `server_saved_project_position_idx` ON `server_saved_project` (`server_key`,`position`);--> statement-breakpoint
CREATE INDEX `server_saved_position_idx` ON `server_saved` (`position`);--> statement-breakpoint
CREATE INDEX `server_saved_default_idx` ON `server_saved` (`is_default`);
