CREATE TABLE `kits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`files` text NOT NULL,
	`parsed` text,
	`errors` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tailored_resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`posting_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tailored_resumes_posting_id_unique` ON `tailored_resumes` (`posting_id`);--> statement-breakpoint
CREATE TABLE `tailored_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tailored_resume_id` integer NOT NULL,
	`rev_no` integer NOT NULL,
	`kit_id` integer NOT NULL,
	`track` text NOT NULL,
	`profile_id` text NOT NULL,
	`profile_name` text NOT NULL,
	`adjustments` text NOT NULL,
	`source` text NOT NULL,
	`resume_md` text NOT NULL,
	`career_md` text NOT NULL,
	`pending_adjustments` text NOT NULL,
	`change_reasons` text NOT NULL,
	`warnings` text NOT NULL,
	`notes` text NOT NULL,
	`user_request` text,
	`job_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tailored_resume_id`) REFERENCES `tailored_resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `ai_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tailored_revisions_resume_rev_idx` ON `tailored_revisions` (`tailored_resume_id`,`rev_no`);