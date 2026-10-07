-- Additive contact-profile revision: make the CMS lead-in describe the
-- website, SME infrastructure and SaaS work that this contact route sells.
-- The previous revision remains in the archive for rollback/audit history.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO revisions
  (id, content_item_id, version, status, data_json, created_by, created_at, published_at, slug, sort_order, cover_media_id)
SELECT
  'migration_contact_profile_services_r1',
  ci.id,
  ci.version + 1,
  'published',
  source.data_json,
  'migration:contact-profile-services:v1',
  '2026-07-29T00:00:00.000Z',
  '2026-07-29T00:00:00.000Z',
  COALESCE(source.slug, ci.slug),
  COALESCE(source.sort_order, ci.sort_order),
  source.cover_media_id
FROM content_items ci
JOIN revisions source
  ON source.id = ci.current_published_revision_id
  AND source.content_item_id = ci.id
WHERE ci.id = 'seed_site_section_contact_profile'
  AND ci.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM revisions existing
    WHERE existing.id = 'migration_contact_profile_services_r1'
  );

INSERT OR IGNORE INTO localizations (revision_id, locale, data_json)
SELECT 'migration_contact_profile_services_r1', 'vi',
  '{"title":"Từ website doanh nghiệp đến SaaS, hãy bắt đầu bằng mục tiêu rõ ràng.","eyebrow":"TƯ VẤN DỰ ÁN / WEBSITE · HẠ TẦNG · SAAS","excerpt":"TUNG tư vấn và triển khai website doanh nghiệp, landing page, bảo mật, hiệu năng, SEO/GEO, hạ tầng SME, module vận hành và SaaS full-stack từ định hướng đến production.","seoTitle":"Tư vấn website, phát triển SaaS & hạ tầng SME — TUNG","seoDescription":"TUNG tư vấn và triển khai website doanh nghiệp, hiệu năng, bảo mật, SEO/GEO, hạ tầng SME và SaaS full-stack.","body":[]}'
WHERE EXISTS (SELECT 1 FROM revisions WHERE id = 'migration_contact_profile_services_r1');

INSERT OR IGNORE INTO localizations (revision_id, locale, data_json)
SELECT 'migration_contact_profile_services_r1', 'en',
  '{"title":"From the business website to the SaaS behind it, start with a clear brief.","eyebrow":"PROJECT INQUIRY / WEBSITE · INFRASTRUCTURE · SAAS","excerpt":"TUNG helps small and growing businesses shape and ship business websites, landing pages, security, performance, SEO/GEO, SME infrastructure, operations modules and full-stack SaaS.","seoTitle":"Website consulting, SaaS development & SME infrastructure — TUNG","seoDescription":"Talk with TUNG about business websites, performance, security, SEO/GEO, SME infrastructure, operations modules or full-stack SaaS.","body":[]}'
WHERE EXISTS (SELECT 1 FROM revisions WHERE id = 'migration_contact_profile_services_r1');

INSERT OR IGNORE INTO localizations (revision_id, locale, data_json)
SELECT 'migration_contact_profile_services_r1', 'ja',
  '{"title":"企業サイトからその先のSaaSまで、明確な目的から始める。","eyebrow":"プロジェクト相談 / WEBSITE · 基盤 · SAAS","excerpt":"TUNGは中小企業の企業サイト、LP、セキュリティ、性能、SEO/GEO、業務基盤、運用モジュール、full-stack SaaSを方向づけからproductionまで支援します。","seoTitle":"企業サイト相談・SaaS開発・中小企業向け基盤 — TUNG","seoDescription":"企業サイト、性能、セキュリティ、SEO/GEO、中小企業向け基盤、業務モジュール、full-stack SaaSについてTUNGに相談できます。","body":[]}'
WHERE EXISTS (SELECT 1 FROM revisions WHERE id = 'migration_contact_profile_services_r1');

INSERT OR IGNORE INTO localizations (revision_id, locale, data_json)
SELECT 'migration_contact_profile_services_r1', 'zh',
  '{"title":"从企业网站到背后的 SaaS，先明确业务目标。","eyebrow":"项目咨询 / 网站 · 基础设施 · SaaS","excerpt":"TUNG 为中小企业规划并交付企业网站、落地页、安全、性能、SEO/GEO、基础设施、运营模块与全栈 SaaS，从方向到 production。","seoTitle":"企业网站咨询、SaaS 开发与中小企业基础设施 — TUNG","seoDescription":"向 TUNG 咨询企业网站、性能、安全、SEO/GEO、中小企业基础设施、运营模块或全栈 SaaS。","body":[]}'
WHERE EXISTS (SELECT 1 FROM revisions WHERE id = 'migration_contact_profile_services_r1');

UPDATE revisions
SET status = 'archived'
WHERE content_item_id = 'seed_site_section_contact_profile'
  AND status = 'published'
  AND id <> 'migration_contact_profile_services_r1';

UPDATE revisions
SET status = 'published', published_at = '2026-07-29T00:00:00.000Z'
WHERE id = 'migration_contact_profile_services_r1'
  AND content_item_id = 'seed_site_section_contact_profile';

UPDATE content_items
SET status = 'published',
    current_published_revision_id = 'migration_contact_profile_services_r1',
    version = version + 1,
    updated_at = '2026-07-29T00:00:00.000Z'
WHERE id = 'seed_site_section_contact_profile'
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM revisions
    WHERE id = 'migration_contact_profile_services_r1'
      AND content_item_id = 'seed_site_section_contact_profile'
      AND status = 'published'
  )
  AND COALESCE(current_published_revision_id, '') <> 'migration_contact_profile_services_r1';
