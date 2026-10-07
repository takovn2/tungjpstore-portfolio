-- Repository locations are internal editorial evidence, not public portfolio content.
UPDATE content_items
SET meta_json = json_remove(meta_json, '$.repoUrl', '$.repositoryUrl', '$.repo_url'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE json_type(meta_json, '$.repoUrl') IS NOT NULL
   OR json_type(meta_json, '$.repositoryUrl') IS NOT NULL
   OR json_type(meta_json, '$.repo_url') IS NOT NULL;

UPDATE revisions
SET data_json = json_remove(data_json, '$.repoUrl', '$.repositoryUrl', '$.repo_url')
WHERE json_type(data_json, '$.repoUrl') IS NOT NULL
   OR json_type(data_json, '$.repositoryUrl') IS NOT NULL
   OR json_type(data_json, '$.repo_url') IS NOT NULL;

UPDATE localizations
SET data_json = json_set(
  data_json,
  '$.body',
  json(COALESCE((
    SELECT json_group_array(json(block.value))
    FROM json_each(localizations.data_json, '$.body') AS block
    WHERE NOT (
      json_extract(block.value, '$.type') = 'cta'
      AND lower(COALESCE(json_extract(block.value, '$.href'), '')) LIKE 'https://github.com/%'
    )
  ), '[]'))
)
WHERE json_type(data_json, '$.body') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(localizations.data_json, '$.body') AS block
    WHERE json_extract(block.value, '$.type') = 'cta'
      AND lower(COALESCE(json_extract(block.value, '$.href'), '')) LIKE 'https://github.com/%'
  );
