-- Make the published CMS hero describe the actual service offer.
-- The homepage hero is managed content, so bundled dictionary changes alone
-- would not reach production. This intentionally replaces only the protected
-- home-hero localization for the current published revision.
PRAGMA foreign_keys = ON;

UPDATE localizations
SET data_json = '{"title":"Tôi thiết kế website giúp doanh nghiệp được tin tưởng và được chọn, rồi xây hệ thống để lớn lên.","eyebrow":"Thiết kế website · Phát triển SaaS · Full-stack","excerpt":"Từ landing page tập trung chuyển đổi đến SaaS đa tenant có backend phức tạp, tôi đồng hành từ nội dung, UI/UX và frontend đến dữ liệu, tích hợp và hạ tầng production.","seoTitle":"Thiết kế website & phát triển SaaS cho doanh nghiệp — TUNG","seoDescription":"TUNG thiết kế website doanh nghiệp, landing page, CMS và phát triển SaaS full-stack cho doanh nghiệp vừa và nhỏ — từ định hướng đến production.","body":[{"type":"cta","label":"Xem dịch vụ & chi phí","href":"/pricing"},{"type":"cta","label":"Trao đổi dự án","href":"/contact"}]}'
WHERE revision_id = (SELECT current_published_revision_id FROM content_items WHERE id = 'seed_site_section_home_hero')
  AND locale = 'vi';

UPDATE localizations
SET data_json = '{"title":"I design websites that help businesses earn trust and get chosen, then build the systems behind growth.","eyebrow":"Website design · SaaS development · Full-stack","excerpt":"From a focused landing page to complex multi-tenant SaaS, I work across content, UI/UX and frontend through data, integrations and production infrastructure.","seoTitle":"Website design & SaaS development for growing businesses — TUNG","seoDescription":"TUNG designs business websites, landing pages and CMS builds, then develops full-stack SaaS when the work needs a deeper product foundation.","body":[{"type":"cta","label":"See services & pricing","href":"/pricing"},{"type":"cta","label":"Discuss a project","href":"/contact"}]}'
WHERE revision_id = (SELECT current_published_revision_id FROM content_items WHERE id = 'seed_site_section_home_hero')
  AND locale = 'en';

UPDATE localizations
SET data_json = '{"title":"企業が信頼され、選ばれるウェブサイトを設計し、成長を支えるシステムまでつくる。","eyebrow":"ウェブサイト制作 · SaaS開発 · Full-stack","excerpt":"明快なランディングページから複雑なマルチテナントSaaSまで、コンテンツ、UI/UX、frontend、データ、連携、production基盤を一貫して扱います。","seoTitle":"企業ウェブサイト制作・SaaS開発 — TUNG","seoDescription":"TUNGは中小企業向けの企業サイト、LP、CMSを設計し、必要に応じてfull-stack SaaSまで開発します。","body":[{"type":"cta","label":"サービスと料金を見る","href":"/pricing"},{"type":"cta","label":"プロジェクトを相談する","href":"/contact"}]}'
WHERE revision_id = (SELECT current_published_revision_id FROM content_items WHERE id = 'seed_site_section_home_hero')
  AND locale = 'ja';

UPDATE localizations
SET data_json = '{"title":"我设计让企业获得信任和选择的网站体验，并构建支撑增长的系统。","eyebrow":"网站设计 · SaaS 开发 · Full-stack","excerpt":"从目标清晰的落地页到复杂的多租户 SaaS，我覆盖内容、UI/UX、前端、数据、集成与 production 基础设施。","seoTitle":"企业网站设计与 SaaS 开发 — TUNG","seoDescription":"TUNG 为中小企业设计企业网站、落地页与 CMS，并在业务需要时开发全栈 SaaS。","body":[{"type":"cta","label":"查看服务与价格","href":"/pricing"},{"type":"cta","label":"讨论项目","href":"/contact"}]}'
WHERE revision_id = (SELECT current_published_revision_id FROM content_items WHERE id = 'seed_site_section_home_hero')
  AND locale = 'zh';

