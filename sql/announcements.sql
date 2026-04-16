-- Create ENUM for announcement types
CREATE TYPE announcement_type AS ENUM ('Common', 'Hostel', 'Worker');
ALTER TYPE announcement_type OWNER TO postgres;

-- Create the announcements table
CREATE TABLE announcements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type announcement_type NOT NULL,
    hostel_name VARCHAR(100)
        CONSTRAINT fk_announcements_hostel
            REFERENCES hostels(name)
            ON UPDATE CASCADE ON DELETE CASCADE,
    created_by UUID
        CONSTRAINT fk_announcements_admin
            REFERENCES admins(id)
            ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE announcements OWNER TO postgres;

-- Create an index to speed up filtering by type and hostel
CREATE INDEX idx_announcements_type_hostel ON announcements (type, hostel_name);