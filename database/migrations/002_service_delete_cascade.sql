-- Allow deleting services that are linked to packages
USE velourmen;

ALTER TABLE package_services DROP FOREIGN KEY fk_ps_service;
ALTER TABLE package_services
  ADD CONSTRAINT fk_ps_service
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
