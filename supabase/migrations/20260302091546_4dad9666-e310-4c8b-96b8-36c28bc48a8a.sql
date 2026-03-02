ALTER TABLE grant_versions 
  DROP CONSTRAINT grant_versions_pipeline_generation_status_check;

ALTER TABLE grant_versions 
  ADD CONSTRAINT grant_versions_pipeline_generation_status_check 
  CHECK (pipeline_generation_status = ANY (ARRAY[
    'none', 'generating', 'draft', 'published', 'not_required'
  ]));