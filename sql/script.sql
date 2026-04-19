create type admin_position as enum ('Chief Warden', 'Hostel Warden', 'Associate Warden', 'Junior Assistant');

alter type admin_position owner to neondb_owner;

create type announcement_type as enum ('Common', 'Hostel', 'Worker');

alter type announcement_type owner to neondb_owner;

create type complaint_status as enum ('Initiated', 'Worker assigned', 'Resolved');

alter type complaint_status owner to neondb_owner;

create table hostels
(
    name       varchar(100) not null
        primary key,
    capacity   integer,
    created_at timestamp with time zone default CURRENT_TIMESTAMP
);

alter table hostels
    owner to neondb_owner;

create table admins
(
    id                       uuid                     default public.uuid_generate_v4() not null
        primary key,
    name                     varchar(255)                                               not null,
    email                    varchar(255)                                               not null
        unique,
    password_hash            varchar(255)                                               not null,
    phone_no                 varchar(20),
    photo                    text,
    position                 public.admin_position                                      not null,
    hostel_name              varchar(100)
        constraint fk_admins_hostel
            references hostels
            on update cascade on delete set null,
    created_at               timestamp with time zone default CURRENT_TIMESTAMP,
    last_login               timestamp with time zone,
    requires_password_change boolean                  default true
);

alter table admins
    owner to neondb_owner;

create table announcements
(
    id          uuid                     default public.uuid_generate_v4() not null
        primary key,
    title       varchar(255)                                               not null,
    content     text                                                       not null,
    type        public.announcement_type                                   not null,
    hostel_name varchar(100)
        constraint fk_announcements_hostel
            references hostels
            on update cascade on delete cascade,
    created_by  uuid
        constraint fk_announcements_admin
            references admins
            on update cascade on delete set null,
    created_at  timestamp with time zone default CURRENT_TIMESTAMP
);

alter table announcements
    owner to neondb_owner;

create index idx_announcements_type_hostel
    on announcements (type, hostel_name);

create table students
(
    id              uuid                     default public.uuid_generate_v4() not null
        primary key,
    google_id       varchar(255)
        unique,
    roll_no         varchar(50)
        unique,
    name            varchar(255)                                               not null,
    email           varchar(255)                                               not null
        unique,
    profile_picture text,
    hostel_name     varchar(100)
        constraint fk_students_hostel
            references hostels
            on update cascade on delete set null,
    room_no         varchar(20),
    floor_no        integer,
    gender          varchar(20),
    phone_no        varchar(20),
    branch          varchar(100),
    year_of_joining integer,
    is_onboarded    boolean                  default false,
    created_at      timestamp with time zone default CURRENT_TIMESTAMP,
    last_login      timestamp with time zone,
    programme       varchar(50)
);

alter table students
    owner to neondb_owner;

create index idx_students_google_id
    on students (google_id);

create table work_department
(
    department   varchar(100) not null,
    sub_category varchar(100) not null,
    primary key (department, sub_category)
);

alter table work_department
    owner to neondb_owner;

create table workers
(
    id                uuid                     default public.uuid_generate_v4() not null
        primary key,
    name              varchar(255)                                               not null,
    email             varchar(255)                                               not null
        unique,
    password_hash     varchar(255)                                               not null,
    phone_no          varchar(20),
    gender            varchar(20),
    photo             text,
    hostel_name       varchar(100)
        constraint fk_workers_hostel
            references hostels
            on update cascade on delete set null,
    department        varchar(100)                                               not null,
    sub_work_category varchar(100),
    current_rating    numeric(3, 2)            default 0.00,
    rating_count      integer                  default 0,
    created_at        timestamp with time zone default CURRENT_TIMESTAMP,
    last_login        timestamp with time zone,
    constraint fk_workers_work_department
        foreign key (department, sub_work_category) references work_department
            on update cascade on delete restrict
);

alter table workers
    owner to neondb_owner;

create table complaints
(
    id                 uuid                     default public.uuid_generate_v4() not null
        primary key,
    complaint_no       serial
        unique,
    student_id         uuid
        references students
            on delete cascade,
    department         varchar(100)                                               not null,
    sub_category       varchar(100),
    description        varchar(300),
    status             public.complaint_status  default 'Initiated'::public.complaint_status,
    complaint_image    text,
    resolved_image     text,
    is_escalated       boolean                  default false,
    worker_id          uuid
                                                                                  references workers
                                                                                      on delete set null,
    rating             integer
        constraint complaints_rating_check
            check ((rating >= 1) AND (rating <= 5)),
    feedback           text,
    lodged_at          timestamp with time zone default CURRENT_TIMESTAMP,
    assigned_at        timestamp with time zone,
    resolved_at        timestamp with time zone,
    resolution_message text,
    constraint fk_complaints_work_department
        foreign key (department, sub_category) references work_department
            on update cascade on delete restrict
);

alter table complaints
    owner to neondb_owner;

create index idx_complaints_status
    on complaints (status);

create index idx_complaints_student
    on complaints (student_id);

create index idx_complaints_worker
    on complaints (worker_id);

create function uuid_nil() returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_nil() owner to cloud_admin;

create function uuid_ns_dns() returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_ns_dns() owner to cloud_admin;

create function uuid_ns_url() returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_ns_url() owner to cloud_admin;

create function uuid_ns_oid() returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_ns_oid() owner to cloud_admin;

create function uuid_ns_x500() returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_ns_x500() owner to cloud_admin;

create function uuid_generate_v1() returns uuid
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_generate_v1() owner to cloud_admin;

create function uuid_generate_v1mc() returns uuid
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_generate_v1mc() owner to cloud_admin;

create function uuid_generate_v3(namespace uuid, name text) returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_generate_v3(uuid, text) owner to cloud_admin;

create function uuid_generate_v4() returns uuid
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_generate_v4() owner to cloud_admin;

create function uuid_generate_v5(namespace uuid, name text) returns uuid
    immutable
    strict
    parallel safe
    language c
as
$$
begin
-- missing source code
end;
$$;

alter function uuid_generate_v5(uuid, text) owner to cloud_admin;


