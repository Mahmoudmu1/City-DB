ALTER TABLE requests
    ADD COLUMN estimated_completion_at DATETIME NULL AFTER status;
