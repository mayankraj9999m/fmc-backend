create table work_department
(
    department   varchar(100) not null,
    sub_category varchar(100) not null,
    primary key (department, sub_category)
);

alter table work_department owner to postgres;

INSERT INTO work_department (department, sub_category)
VALUES
    ('Civil', 'Wall and roof'),
    ('Civil', 'Carpentry'),
    ('Civil', 'Plumbing'),
    ('Electrical', 'Electrician'),
    ('Electrical', 'Lift maintainer'),
    ('IT/Network', 'No signal incoming'),
    ('IT/Network', 'Software Problem'),
    ('Sanitation', 'Room Cleaning')
ON CONFLICT DO NOTHING;

-- Enforce referential integrity
alter table public.workers add constraint fk_workers_work_department
    foreign key (department, sub_work_category)
    references work_department (department, sub_category)
    on update cascade on delete restrict;

-- Enforce referential integrity
alter table public.complaints add constraint fk_complaints_work_department
    foreign key (department, sub_category)
    references work_department (department, sub_category)
    on update cascade on delete restrict;