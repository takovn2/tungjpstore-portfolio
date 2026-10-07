-- Keep public routing and presentation fields pinned to the published revision.
-- Nullable columns preserve compatibility with revisions inserted before this migration.
ALTER TABLE revisions ADD COLUMN slug TEXT;
ALTER TABLE revisions ADD COLUMN sort_order INTEGER;
ALTER TABLE revisions ADD COLUMN cover_media_id TEXT;

UPDATE revisions
SET slug = (
    SELECT ci.slug FROM content_items ci WHERE ci.id = revisions.content_item_id
  ),
  sort_order = (
    SELECT ci.sort_order FROM content_items ci WHERE ci.id = revisions.content_item_id
  ),
  cover_media_id = (
    SELECT ci.cover_media_id FROM content_items ci WHERE ci.id = revisions.content_item_id
  )
WHERE EXISTS (
  SELECT 1 FROM content_items ci WHERE ci.id = revisions.content_item_id
);
