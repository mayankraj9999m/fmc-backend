CREATE SCHEMA "public";
CREATE TYPE "hostel_enum" AS ENUM('Dhauladhar', 'Shivalik', 'Yamuna');
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"phone" varchar(15) NOT NULL,
	"hostel_name" hostel_enum,
	"position" varchar(100) NOT NULL,
	"email" varchar(255),
	"photo" text,
	"created_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'::text),
	"password_hash" varchar(255)
);
CREATE TABLE "students" (
	"google_id" varchar(255) PRIMARY KEY,
	"email" varchar(255) NOT NULL CONSTRAINT "students_email_key" UNIQUE,
	"name" varchar(255) NOT NULL,
	"profile_picture" text,
	"hostel_name" hostel_enum,
	"room_no" varchar(20),
	"floor_no" integer,
	"phone_number" varchar(15),
	"is_onboarded" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'::text),
	"updated_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'::text),
	CONSTRAINT "students_floor_no_check" CHECK (CHECK (((floor_no >= 0) AND (floor_no <= 7))))
);
CREATE TABLE "workers" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"phone_no" varchar(15) NOT NULL,
	"hostel_name" hostel_enum NOT NULL,
	"department" varchar(100) NOT NULL,
	"sub_work_category" varchar(100),
	"email" varchar(255),
	"photo" text,
	"current_rating" numeric(3, 2) DEFAULT '5.00',
	"rating_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'::text),
	"password_hash" varchar(255),
	CONSTRAINT "workers_current_rating_check" CHECK (CHECK (((current_rating >= (1)::numeric) AND (current_rating <= (5)::numeric))))
);
CREATE UNIQUE INDEX "admins_pkey" ON "admins" ("id");
CREATE UNIQUE INDEX "students_email_key" ON "students" ("email");
CREATE UNIQUE INDEX "students_pkey" ON "students" ("google_id");
CREATE UNIQUE INDEX "workers_pkey" ON "workers" ("id");