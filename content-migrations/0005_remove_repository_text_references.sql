-- Remove repository references that may have been stored as ordinary CMS text.
-- Lists are sanitized item-by-item so a single private link cannot erase
-- unrelated, publishable evidence in the same list.
UPDATE localizations
SET data_json = json_set(
  data_json,
  '$.body',
  json(COALESCE((
    SELECT json_group_array(json(block.value))
    FROM json_each(localizations.data_json, '$.body') AS block
    WHERE (
      json_extract(block.value, '$.type') = 'list'
      AND EXISTS (
        SELECT 1
        FROM json_each(block.value, '$.items') AS item
        WHERE lower(CAST(item.value AS TEXT)) NOT LIKE '%github.com%'
          AND lower(CAST(item.value AS TEXT)) NOT LIKE '%githubusercontent.com%'
      )
    )
    OR (
      json_extract(block.value, '$.type') <> 'list'
      AND lower(json(block.value)) NOT LIKE '%github.com%'
      AND lower(json(block.value)) NOT LIKE '%githubusercontent.com%'
    )
  ), '[]'))
)
WHERE json_type(data_json, '$.body') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(localizations.data_json, '$.body') AS block
    WHERE lower(json(block.value)) LIKE '%github.com%'
       OR lower(json(block.value)) LIKE '%githubusercontent.com%'
  );

UPDATE localizations
SET data_json = json_set(
  data_json,
  '$.body',
  json(COALESCE((
    SELECT json_group_array(
      CASE
        WHEN json_extract(block.value, '$.type') = 'list' THEN json_set(
          block.value,
          '$.items',
          json(COALESCE((
            SELECT json_group_array(item.value)
            FROM json_each(block.value, '$.items') AS item
            WHERE lower(CAST(item.value AS TEXT)) NOT LIKE '%github.com%'
              AND lower(CAST(item.value AS TEXT)) NOT LIKE '%githubusercontent.com%'
          ), '[]'))
        )
        ELSE block.value
      END
    )
    FROM json_each(localizations.data_json, '$.body') AS block
  ), '[]'))
)
WHERE json_type(data_json, '$.body') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(data_json, '$.body') AS block
    WHERE json_extract(block.value, '$.type') = 'list'
      AND EXISTS (
        SELECT 1
        FROM json_each(block.value, '$.items') AS item
        WHERE lower(CAST(item.value AS TEXT)) LIKE '%github.com%'
           OR lower(CAST(item.value AS TEXT)) LIKE '%githubusercontent.com%'
      )
  );
