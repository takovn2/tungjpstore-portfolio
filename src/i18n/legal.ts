import type { Locale } from "./dictionaries";

export type PolicyKind = "terms" | "privacy" | "refund";

type PolicySection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  note?: string;
};

export type PolicyCopy = {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  label: string;
  heading: string;
  intro: string;
  effectiveLabel: string;
  effectiveDate: string;
  effectiveIsoDate: string;
  summaryLabel: string;
  summaries: readonly { label: string; value: string }[];
  tocLabel: string;
  sections: readonly PolicySection[];
  contactHeading: string;
  contactBody: string;
  contactCta: string;
  relatedLabel: string;
};

type LegalLocaleCopy = Record<PolicyKind, PolicyCopy>;

const legalCopy = {
  vi: {
    terms: {
      slug: "terms-of-service",
      navLabel: "Điều khoản",
      metaTitle: "Điều khoản dịch vụ — TUNG",
      metaDescription: "Điều khoản cho dịch vụ thiết kế website, phát triển SaaS, hỗ trợ kỹ thuật và giao dịch sản phẩm số tại tung.codes.",
      label: "ĐIỀU KHOẢN / DỊCH VỤ",
      heading: "Điều kiện rõ trước khi bắt đầu.",
      intro: "Điều khoản này tách rõ hai nhóm giao dịch: dịch vụ thiết kế/phát triển website hoặc SaaS theo proposal, và sản phẩm số mua trực tiếp tại cửa hàng. Nếu proposal, statement of work hoặc hợp đồng đã ký có nội dung cụ thể hơn, văn bản đó được ưu tiên cho dự án liên quan.",
      effectiveLabel: "Có hiệu lực",
      effectiveDate: "29 tháng 7, 2026",
      effectiveIsoDate: "2026-07-29",
      summaryLabel: "Tóm tắt dễ đọc",
      summaries: [
        { label: "Dự án dịch vụ", value: "Proposal xác định phạm vi, mốc bàn giao, lịch thanh toán, nghiệm thu và quyền sở hữu." },
        { label: "Sản phẩm số", value: "Trang sản phẩm xác định phiên bản, giá, giấy phép, cách bàn giao và hỗ trợ đi kèm." },
        { label: "Thay đổi", value: "Yêu cầu ngoài phạm vi cần được xác nhận về chi phí và lịch trước khi thực hiện." },
      ],
      tocLabel: "Trong tài liệu này",
      sections: [
        {
          id: "acceptance",
          title: "1. Chấp nhận điều khoản",
          paragraphs: ["Khi truy cập hoặc sử dụng tung.codes, tạo tài khoản, gửi biểu mẫu, đặt hàng hay ký một scope dịch vụ, bạn đồng ý với điều khoản này và các policy được dẫn chiếu. Nếu bạn sử dụng thay mặt tổ chức, bạn xác nhận mình có quyền ràng buộc tổ chức đó."],
        },
        {
          id: "scope",
          title: "2. Phạm vi dịch vụ",
          paragraphs: ["TUNG vận hành portfolio, nội dung, biểu mẫu liên hệ, cửa hàng sản phẩm số, tài khoản khách hàng, luồng thanh toán và bàn giao. Sản phẩm có thể là license key, tài nguyên tải xuống hoặc dịch vụ xử lý thủ công. Mô tả, phiên bản, điều kiện sử dụng và hình thức bàn giao cụ thể trên trang sản phẩm là một phần của giao dịch."],
          note: "Website của bên thứ ba được liên kết từ TUNG có điều khoản và cách vận hành riêng.",
        },
        {
          id: "eligibility-accounts",
          title: "3. Điều kiện sử dụng và tài khoản",
          paragraphs: ["Bạn phải có năng lực giao kết theo pháp luật áp dụng và cung cấp thông tin chính xác. Bạn chịu trách nhiệm với hoạt động phát sinh từ tài khoản, email đã xác minh, order access link, magic link và thiết bị của mình."],
          bullets: ["Không chia sẻ mật khẩu, OTP, link đăng nhập hoặc license key.", "Thông báo sớm nếu phát hiện truy cập trái phép hoặc thông tin đơn không đúng.", "Không tạo tài khoản hay đơn hàng nhằm né giới hạn, lạm dụng khuyến mại hoặc gây hại hệ thống."],
        },
        {
          id: "orders-pricing",
          title: "4. Sản phẩm, giá và việc hình thành đơn",
          paragraphs: ["Giá, tiền tệ, phiên bản, tồn kho và phương thức bàn giao hiển thị tại thời điểm tạo đơn được kiểm tra lại ở backend. Việc gửi đơn chưa có nghĩa TUNG đã chấp nhận bán. Đơn được chấp nhận khi thanh toán được xác minh và hệ thống xác nhận có thể thực hiện bàn giao."],
          bullets: ["TUNG có thể từ chối hoặc hủy đơn do sai giá rõ ràng, hết tồn kho, rủi ro gian lận, giới hạn nhà cung cấp hoặc yêu cầu pháp lý.", "Nếu một đơn đã thanh toán không thể được chấp nhận, TUNG sẽ xử lý theo Chính sách hoàn tiền.", "Thuế, phí ngân hàng hoặc phí bên thứ ba chỉ áp dụng khi được hiển thị hoặc nêu trong proposal."],
        },
        {
          id: "payment",
          title: "5. Thanh toán và xác minh",
          paragraphs: ["Luồng cửa hàng có thể tạo VietQR hoặc liên kết thanh toán qua nhà cung cấp hỗ trợ. Bạn phải dùng đúng số tiền và mã tham chiếu của đơn. Ảnh chụp chuyển khoản không thay thế trạng thái backend; đơn chỉ chuyển sang đã thanh toán sau khi tín hiệu được đối chiếu."],
          bullets: ["Không thanh toán theo QR, tài khoản hay hướng dẫn nhận từ nguồn ngoài tung.codes.", "Không thực hiện giao dịch thứ hai cho cùng đơn khi trạng thái đang xác minh.", "Giữ mã đơn nhưng không công khai order access link hoặc dữ liệu bàn giao."],
        },
        {
          id: "digital-fulfilment",
          title: "6. Bàn giao và quyền sử dụng sản phẩm số",
          paragraphs: ["Bàn giao có thể tự động sau xác minh hoặc được kiểm tra thủ công. Trừ khi trang sản phẩm nói khác, việc mua sản phẩm số cấp cho bạn quyền sử dụng giới hạn, không độc quyền và không chuyển nhượng; không chuyển giao quyền sở hữu trí tuệ đối với phần mềm, nội dung, thương hiệu hoặc tài sản gốc."],
          bullets: ["Không bán lại, chia sẻ công khai, sao chép hàng loạt, phá cơ chế truy cập hoặc dùng sản phẩm cho hành vi trái pháp luật.", "Không dùng key hoặc tài khoản vượt số người, thiết bị, thời hạn hay khu vực được mô tả.", "Bạn chịu trách nhiệm kiểm tra yêu cầu hệ thống và điều kiện của nền tảng thứ ba trước khi mua."],
        },
        {
          id: "third-parties",
          title: "7. Dịch vụ và nền tảng bên thứ ba",
          paragraphs: ["Một số sản phẩm phụ thuộc vào nhà cung cấp, nền tảng, API, ngân hàng hoặc điều khoản của bên thứ ba. TUNG không kiểm soát thay đổi về tính năng, giá, vùng, chính sách hoặc quyết định khóa tài khoản của họ. TUNG sẽ mô tả trung thực những gì mình cung cấp, nhưng không thể cấp quyền vượt quá quyền của bên thứ ba."],
        },
        {
          id: "professional-services",
          title: "8. Proposal, đặt cọc và khởi động dự án",
          paragraphs: ["Dịch vụ có thể gồm tư vấn, UX/UI, landing page, website doanh nghiệp vừa và nhỏ, frontend, backend, tích hợp, hệ thống SaaS, bảo mật, hiệu năng/SEO, hạ tầng cho doanh nghiệp, business email, module HR/vận hành và hỗ trợ kỹ thuật. Proposal hoặc statement of work xác định deliverable, phần không bao gồm, giả định, timeline dự kiến, giá, thuế/phí nếu có, lịch thanh toán và tiêu chí nghiệm thu."],
          bullets: ["Dự án chỉ được xếp lịch hoặc bắt đầu sau khi proposal được chấp thuận và khoản đặt cọc/milestone đầu tiên đã được xác minh, trừ khi văn bản riêng nói khác.", "Báo giá ước tính có thể thay đổi khi dữ liệu đầu vào hoặc phạm vi thay đổi; báo giá cố định chỉ áp dụng cho phạm vi được ghi rõ.", "Phí domain, hosting, plugin, stock asset, API và dịch vụ bên thứ ba không được mặc nhiên bao gồm."],
          note: "Khi có xung đột, hợp đồng hoặc proposal đã ký được ưu tiên cho engagement đó.",
        },
        {
          id: "collaboration-changes-acceptance",
          title: "9. Phối hợp, thay đổi và nghiệm thu",
          paragraphs: ["Khách hàng cần cung cấp nội dung, tài sản thương hiệu, quyền truy cập, dữ liệu thử nghiệm, quyết định và phản hồi hợp lý đúng thời hạn. Khách hàng xác nhận mình có quyền sử dụng tài liệu đã cung cấp. Chậm phản hồi, thiếu quyền truy cập hoặc phụ thuộc bên thứ ba có thể làm dịch chuyển lịch mà không được xem là chậm giao do TUNG."],
          bullets: ["Yêu cầu ngoài scope được xử lý bằng change request hoặc xác nhận bằng văn bản về tác động tới giá, lịch và deliverable.", "TUNG chỉ triển khai thay đổi sau khi hai bên thống nhất, trừ sửa lỗi rõ ràng trong phạm vi đã chấp thuận.", "Nghiệm thu và thời hạn review tuân theo proposal. Việc im lặng hoặc đưa lên production chỉ được coi là nghiệm thu khi proposal quy định rõ."],
        },
        {
          id: "service-ip-handover",
          title: "10. Quyền sở hữu và bàn giao dự án",
          paragraphs: ["Khách hàng giữ quyền với nội dung, dữ liệu và tài sản hợp pháp đã cung cấp. Sau khi thanh toán đầy đủ, quyền sử dụng hoặc quyền sở hữu đối với deliverable tùy chỉnh được chuyển theo đúng phạm vi nêu trong proposal. TUNG và bên cấp phép vẫn giữ quyền với công cụ, framework, component dùng lại, know-how, tài sản có trước và phần mềm nguồn mở hoặc bên thứ ba."],
          bullets: ["Source code, file thiết kế, tài liệu vận hành, tài khoản và thông tin truy cập chỉ được bàn giao khi nằm trong deliverable đã thỏa thuận.", "License của font, plugin, stock asset, API và open-source tiếp tục chịu điều khoản của nhà cung cấp tương ứng.", "Mỗi bên bảo vệ thông tin chưa công khai được chia sẻ cho engagement; NDA hoặc điều khoản bảo mật riêng được ưu tiên nếu có.", "Case study hoặc việc nêu tên khách hàng chỉ sử dụng thông tin đã công khai, được cho phép hoặc được proposal quy định; nghĩa vụ bảo mật vẫn được tôn trọng."],
        },
        {
          id: "support-hosting",
          title: "11. Bảo hành lỗi, hỗ trợ, hosting và vận hành",
          paragraphs: ["Thời hạn sửa lỗi sau bàn giao, SLA, bảo trì, hosting, backup, giám sát, cập nhật nội dung hoặc hỗ trợ vận hành chỉ áp dụng khi được nêu trong proposal hoặc gói hỗ trợ. Bảo hành lỗi không bao gồm tính năng mới, thay đổi nội dung, thay đổi từ nhà cung cấp, hoặc lỗi do khách hàng/bên thứ ba sửa hệ thống sau bàn giao. TUNG có thể tư vấn semantic HTML, accessibility, hiệu năng và SEO kỹ thuật, nhưng không bảo đảm điểm audit, thứ hạng tìm kiếm, traffic, chuyển đổi hoặc khả năng tiếp cận tuyệt đối trừ khi proposal ghi rõ tiêu chí đo lường."],
          note: "Tài khoản domain, cloud, email, analytics và dịch vụ sản xuất nên thuộc quyền kiểm soát của khách hàng; phí gia hạn và tuân thủ điều khoản nhà cung cấp thuộc bên đứng tên tài khoản, trừ khi có thỏa thuận khác.",
        },
        {
          id: "acceptable-use",
          title: "12. Sử dụng được phép",
          paragraphs: ["Bạn không được tấn công, quét lỗ hổng trái phép, can thiệp thanh toán, thu thập dữ liệu hàng loạt, né rate limit, giả mạo danh tính, phát tán mã độc hoặc dùng dịch vụ để xâm phạm quyền của người khác. TUNG có thể giới hạn hoặc chấm dứt truy cập khi cần bảo vệ người dùng, hệ thống hoặc tuân thủ pháp luật."],
        },
        {
          id: "refunds",
          title: "13. Hủy, hoàn tiền và chargeback",
          paragraphs: ["Quyền hủy và hoàn tiền được mô tả trong Chính sách hoàn tiền. Vì sản phẩm số có thể được sử dụng ngay sau khi hiển thị key, tải xuống hoặc kích hoạt, thay đổi ý định sau khi bàn giao không tự động tạo quyền hoàn tiền. Hãy liên hệ trước khi mở chargeback để TUNG có thể kiểm tra bằng chứng đơn và trạng thái bàn giao; điều này không làm mất quyền bắt buộc của bạn theo pháp luật."],
        },
        {
          id: "intellectual-property",
          title: "14. Sở hữu trí tuệ của website và cửa hàng",
          paragraphs: ["TUNG và bên cấp phép giữ quyền với tung.codes, nhận diện, nội dung biên tập, phần mềm cửa hàng và tài sản có trước. Việc truy cập website hoặc mua sản phẩm số không chuyển giao các quyền này ngoài license được mô tả rõ trên trang sản phẩm."],
        },
        {
          id: "disclaimers-liability",
          title: "15. Cam kết, miễn trừ và giới hạn trách nhiệm",
          paragraphs: ["TUNG cung cấp dịch vụ với sự cẩn trọng hợp lý và sẽ mô tả trạng thái sản phẩm trung thực. Tuy nhiên, trong phạm vi pháp luật cho phép, website và dịch vụ không được bảo đảm luôn liên tục, không lỗi hoặc phù hợp mọi mục đích. TUNG không chịu trách nhiệm cho gián đoạn hoặc quyết định của nền tảng bên thứ ba ngoài khả năng kiểm soát."],
          bullets: ["Trong phạm vi pháp luật cho phép, tổng trách nhiệm liên quan một đơn hoặc engagement không vượt quá khoản bạn đã trả cho đơn hoặc engagement gây ra khiếu nại.", "Giới hạn này không loại trừ trách nhiệm không thể loại trừ theo pháp luật, bao gồm gian lận hoặc hành vi cố ý sai trái khi pháp luật quy định."],
        },
        {
          id: "changes-disputes",
          title: "16. Thay đổi và giải quyết bất đồng",
          paragraphs: ["TUNG có thể cập nhật điều khoản khi dịch vụ hoặc yêu cầu pháp lý thay đổi. Ngày hiệu lực mới sẽ được hiển thị trên trang này. Nếu có bất đồng, hai bên trước hết trao đổi thiện chí qua địa chỉ liên hệ; luật bắt buộc và quyền người tiêu dùng tại nơi áp dụng vẫn được tôn trọng."],
        },
      ],
      contactHeading: "Cần làm rõ một điều khoản?",
      contactBody: "Gửi câu hỏi cùng URL sản phẩm, mã đơn hoặc proposal liên quan. Không gửi mật khẩu, OTP hay license key trong nội dung liên hệ.",
      contactCta: "Liên hệ TUNG",
      relatedLabel: "Policy liên quan",
    },
    privacy: {
      slug: "privacy-policy",
      navLabel: "Quyền riêng tư",
      metaTitle: "Chính sách quyền riêng tư — TUNG",
      metaDescription: "Cách TUNG xử lý dữ liệu khi tư vấn, thiết kế website, phát triển SaaS, hỗ trợ dự án và vận hành cửa hàng số.",
      label: "QUYỀN RIÊNG TƯ / DỮ LIỆU",
      heading: "Thu thập ít. Giải thích rõ.",
      intro: "Chính sách này bao quát portfolio, liên hệ dự án, dịch vụ thiết kế/phát triển, tài khoản, cửa hàng số, thanh toán và hỗ trợ trên tung.codes. Dữ liệu dự án của khách hàng được tách khỏi dữ liệu TUNG cần cho báo giá, hợp đồng, thanh toán, bảo mật và vận hành.",
      effectiveLabel: "Cập nhật",
      effectiveDate: "29 tháng 7, 2026",
      effectiveIsoDate: "2026-07-29",
      summaryLabel: "Điểm chính",
      summaries: [
        { label: "Khách hàng tiềm năng", value: "Thông tin liên hệ, mục tiêu, ngân sách và bối cảnh cần để đánh giá dự án." },
        { label: "Dữ liệu dự án", value: "Nội dung, quyền truy cập và dữ liệu thử nghiệm chỉ được dùng để thực hiện scope đã thống nhất." },
        { label: "Giao dịch", value: "Tài khoản, đơn hàng, thanh toán và log bảo mật được giữ theo nhu cầu vận hành và pháp lý." },
      ],
      tocLabel: "Trong chính sách này",
      sections: [
        {
          id: "scope-controller",
          title: "1. Phạm vi và bên vận hành",
          paragraphs: ["Chính sách áp dụng khi TUNG vận hành tung.codes và xử lý dữ liệu cho portfolio, liên hệ, tài khoản, đơn hàng, thanh toán, hỗ trợ và dịch vụ chuyên môn. Website hoặc nền tảng bên thứ ba được liên kết có chính sách riêng. Với câu hỏi dữ liệu, bạn có thể liên hệ hello@tung.codes."],
        },
        {
          id: "data-collected",
          title: "2. Dữ liệu được thu thập",
          paragraphs: ["Dữ liệu phụ thuộc vào cách bạn sử dụng website. TUNG ưu tiên chỉ thu thập thông tin cần để hoàn thành hành động bạn yêu cầu."],
          bullets: ["Liên hệ: tên, email, công ty, website dự án, nhu cầu, ngân sách, timeline và nội dung bạn gửi.", "Tài khoản: tên hiển thị, email đã xác minh, nhà cung cấp đăng nhập, ID định danh ngoài, phiên đăng nhập và sự kiện bảo mật.", "Đơn hàng: sản phẩm, phiên bản, số lượng, giá, mã đơn, email/tên snapshot, số điện thoại nếu cung cấp, trạng thái thanh toán và bàn giao.", "Thanh toán: mã tham chiếu, số tiền, trạng thái và bằng chứng giao dịch từ nhà cung cấp; TUNG không yêu cầu lưu số thẻ thanh toán trên website.", "Kỹ thuật: thời gian, route, User-Agent rút gọn hoặc hash, IP hash, request ID, log lỗi, tín hiệu rate-limit và chống gian lận.", "Dữ liệu dự án: brief, nội dung, thiết kế, repository, ticket, log, cấu hình, tài khoản truy cập, dữ liệu staging/test hoặc dữ liệu khác bạn chủ động cấp cho scope."],
        },
        {
          id: "purposes",
          title: "3. Mục đích sử dụng",
          paragraphs: ["Dữ liệu được dùng để cung cấp chức năng bạn yêu cầu, thực hiện giao dịch, bảo vệ hệ thống và đáp ứng nghĩa vụ vận hành."],
          bullets: ["Trả lời liên hệ, đánh giá mức phù hợp, chuẩn bị proposal và quản lý dự án.", "Thiết kế, phát triển, kiểm thử, triển khai và hỗ trợ deliverable trong scope đã thống nhất.", "Tạo và bảo vệ tài khoản, xác minh email, hỗ trợ đăng nhập và khôi phục.", "Tính giá, tạo đơn, đối chiếu thanh toán, bàn giao key hoặc download và hỗ trợ sau mua.", "Ngăn spam, gian lận, truy cập trái phép và sự cố bảo mật; theo dõi hiệu năng hoặc lỗi ở mức cần thiết.", "Lưu hồ sơ hợp đồng, giao dịch, kế toán, tranh chấp và tuân thủ khi pháp luật yêu cầu."],
        },
        {
          id: "legal-bases",
          title: "4. Cơ sở xử lý",
          paragraphs: ["Tùy bối cảnh và pháp luật áp dụng, TUNG xử lý dữ liệu để thực hiện hợp đồng hoặc yêu cầu trước hợp đồng, đáp ứng nghĩa vụ pháp lý, bảo vệ lợi ích hợp pháp như an ninh và chống gian lận, hoặc dựa trên sự đồng ý khi cần. Bạn có thể rút lại sự đồng ý cho xử lý dựa trên consent, nhưng việc đó không làm mất tính hợp pháp của xử lý trước thời điểm rút."],
        },
        {
          id: "client-project-data",
          title: "5. Dữ liệu trong dự án khách hàng",
          paragraphs: ["Khi TUNG xử lý dữ liệu cá nhân trong hệ thống của khách hàng chỉ để xây dựng, kiểm thử, di chuyển hoặc hỗ trợ sản phẩm, khách hàng quyết định mục đích và chịu trách nhiệm về thông báo, quyền thu thập và chỉ dẫn hợp pháp. TUNG xử lý theo scope, chỉ dẫn được ghi nhận và data processing agreement nếu hai bên ký. TUNG vẫn là bên quyết định độc lập đối với dữ liệu cần cho báo giá, hợp đồng, hóa đơn, an ninh và quản lý quan hệ khách hàng."],
          bullets: ["Ưu tiên dữ liệu giả, đã ẩn danh hoặc staging thay cho dữ liệu production khi có thể.", "Chỉ cấp quyền tối thiểu cần thiết, dùng tài khoản riêng và thu hồi quyền khi milestone hoặc dự án kết thúc.", "Không cung cấp dữ liệu nhạy cảm, secret hoặc dữ liệu người dùng nếu chưa thống nhất biện pháp xử lý phù hợp."],
          note: "Khách hàng không nên đưa mật khẩu, private key hoặc production secret vào biểu mẫu liên hệ thông thường.",
        },
        {
          id: "payments-providers",
          title: "6. Thanh toán và nhà cung cấp dịch vụ",
          paragraphs: ["TUNG dùng nhà cung cấp có giới hạn mục đích để vận hành hạ tầng, xác thực, thanh toán và email. Họ có thể xử lý dữ liệu theo chỉ dẫn của TUNG hoặc theo nghĩa vụ độc lập của họ."],
          bullets: ["Cloudflare: hosting, CDN, bảo mật, Turnstile, analytics tổng hợp và hạ tầng email/Worker liên quan.", "PayOS, VietQR, ngân hàng và đối tác thanh toán: tạo chỉ dẫn thanh toán, đối chiếu và báo trạng thái giao dịch.", "Google hoặc nhà cung cấp đăng nhập: chỉ khi bạn chọn đăng nhập qua dịch vụ đó.", "Nhà cung cấp email: gửi xác minh, cảnh báo đăng nhập, cập nhật đơn và phản hồi hỗ trợ.", "Telegram: chỉ khi bạn chủ động sử dụng kênh bot hoặc thương mại Telegram được cung cấp."],
          note: "TUNG không bán hoặc cho thuê dữ liệu cá nhân cho data broker hay mạng quảng cáo.",
        },
        {
          id: "cookies-storage-analytics",
          title: "7. Cookie, lưu trữ trình duyệt và analytics",
          paragraphs: ["Website không dùng cookie quảng cáo. Cookie hoặc browser storage cần thiết có thể giữ phiên đăng nhập, trạng thái giỏ hàng, ngôn ngữ, mã truy cập đơn hoặc bảo vệ chống giả mạo. Cloudflare Web Analytics có thể ghi số liệu tổng hợp, không nhận nội dung biểu mẫu, mật khẩu hoặc license key."],
          note: "Xóa cookie hoặc storage có thể đăng xuất bạn, làm mất giỏ hàng cục bộ hoặc khiến bạn phải mở lại order link.",
        },
        {
          id: "sharing",
          title: "8. Khi nào dữ liệu được chia sẻ",
          paragraphs: ["Dữ liệu chỉ được chia sẻ với nhà cung cấp cần cho chức năng, cố vấn chuyên môn chịu nghĩa vụ bảo mật, cơ quan có thẩm quyền khi có yêu cầu hợp pháp, hoặc bên kế nhiệm nếu hoạt động được chuyển giao hợp pháp. TUNG cố gắng giới hạn trường dữ liệu và quyền truy cập theo mục đích."],
        },
        {
          id: "international",
          title: "9. Xử lý xuyên biên giới",
          paragraphs: ["TUNG làm việc giữa Việt Nam và Nhật Bản; nhà cung cấp cloud, email, đăng nhập hoặc thanh toán có thể xử lý dữ liệu tại nhiều quốc gia. Khi cần, TUNG sử dụng hợp đồng, cấu hình nhà cung cấp và biện pháp phù hợp để bảo vệ dữ liệu trong quá trình chuyển."],
        },
        {
          id: "retention",
          title: "10. Thời gian lưu giữ",
          paragraphs: ["Dữ liệu được giữ trong thời gian cần để cung cấp dịch vụ, giữ an toàn, xử lý hỗ trợ và đáp ứng nghĩa vụ hợp đồng, giao dịch, thuế, kế toán hoặc tranh chấp. Phiên và challenge thường ngắn; proposal, invoice, đơn hàng, audit và bằng chứng thanh toán có thể cần lâu hơn. Dữ liệu dự án và quyền truy cập được xem xét khi milestone hoặc engagement kết thúc; backup hoặc log có thể tồn tại thêm một thời gian giới hạn theo vòng đời hệ thống. Khi không còn cần, dữ liệu được xóa, ẩn danh hoặc tách khỏi hoạt động thường xuyên trong khả năng kỹ thuật hợp lý."],
        },
        {
          id: "rights",
          title: "11. Quyền và lựa chọn của bạn",
          paragraphs: ["Tùy pháp luật áp dụng, bạn có thể yêu cầu biết dữ liệu đang được xử lý, nhận bản sao, sửa, xóa, hạn chế, phản đối hoặc rút consent. TUNG có thể cần xác minh danh tính và có thể giữ một số hồ sơ khi pháp luật hoặc quyền hợp pháp yêu cầu."],
          bullets: ["Dùng trang Liên hệ hoặc email hello@tung.codes và nêu email/tài khoản liên quan.", "Không gửi mật khẩu, OTP, order access token hoặc license key để chứng minh danh tính.", "Nếu không hài lòng, bạn có thể liên hệ cơ quan bảo vệ dữ liệu có thẩm quyền tại nơi mình cư trú."],
        },
        {
          id: "security",
          title: "12. Bảo mật dữ liệu",
          paragraphs: ["TUNG dùng HTTPS, phân quyền, phiên có thời hạn, hash hoặc mã hóa cho dữ liệu nhạy cảm phù hợp, rate limit, audit và kiểm soát truy cập quản trị. Không hệ thống nào an toàn tuyệt đối; nếu phát hiện sự cố có rủi ro đáng kể, TUNG sẽ đánh giá và thông báo theo yêu cầu pháp luật."],
        },
        {
          id: "children-changes",
          title: "13. Trẻ em và thay đổi chính sách",
          paragraphs: ["Dịch vụ chuyên môn, mua hàng và tài khoản không hướng tới trẻ em. Nếu phát hiện dữ liệu trẻ em được gửi mà không có cơ sở phù hợp, TUNG có thể xóa hoặc yêu cầu người có trách nhiệm xác minh. Chính sách có thể được cập nhật khi dịch vụ, nhà cung cấp hoặc yêu cầu pháp lý thay đổi; ngày cập nhật sẽ được hiển thị trên trang này."],
        },
      ],
      contactHeading: "Bạn muốn kiểm tra dữ liệu của mình?",
      contactBody: "Gửi yêu cầu bằng email đã dùng cho tài khoản hoặc đơn hàng. Chỉ nêu mã đơn khi cần; không gửi mật khẩu, OTP hoặc license key.",
      contactCta: "Gửi yêu cầu dữ liệu",
      relatedLabel: "Policy liên quan",
    },
    refund: {
      slug: "refund-policy",
      navLabel: "Hoàn tiền",
      metaTitle: "Chính sách hoàn tiền — TUNG",
      metaDescription: "Chính sách hủy, khắc phục và hoàn tiền cho sản phẩm số, dự án website, SaaS, tiền đặt cọc và milestone dịch vụ.",
      label: "HOÀN TIỀN / KHẮC PHỤC",
      heading: "Xử lý theo bằng chứng, không theo phỏng đoán.",
      intro: "Cửa hàng số và dự án dịch vụ có cách hủy khác nhau. Sản phẩm số được xem xét theo trạng thái bàn giao; dự án website/SaaS được đối chiếu theo proposal, nguồn lực đã giữ, milestone đã làm và chi phí bên thứ ba đã cam kết.",
      effectiveLabel: "Cập nhật",
      effectiveDate: "29 tháng 7, 2026",
      effectiveIsoDate: "2026-07-29",
      summaryLabel: "Cách policy hoạt động",
      summaries: [
        { label: "Cửa hàng", value: "Key, file và quyền truy cập được kiểm tra theo mô tả, trạng thái kích hoạt và bằng chứng bàn giao." },
        { label: "Dịch vụ", value: "Tiền đặt cọc, milestone, nguồn lực đã giữ và chi phí đã cam kết được đối chiếu theo proposal." },
        { label: "Khắc phục", value: "Ưu tiên sửa lỗi, giao lại hoặc hoàn thành phần thiếu trước khi xác định khoản hoàn phù hợp." },
      ],
      tocLabel: "Trong chính sách này",
      sections: [
        {
          id: "scope",
          title: "1. Phạm vi",
          paragraphs: ["Chính sách áp dụng cho hai nhóm riêng biệt: (a) license key, tài nguyên tải xuống và sản phẩm số giao trực tiếp; (b) khoản đặt cọc, milestone và trả trước cho tư vấn, thiết kế website, frontend/backend, tích hợp, SaaS hoặc hỗ trợ kỹ thuật. Trang sản phẩm, proposal, hợp đồng và pháp luật bắt buộc được ưu tiên khi có quy định cụ thể hơn hoặc có lợi hơn cho bạn."],
        },
        {
          id: "request-window",
          title: "2. Thời hạn gửi yêu cầu",
          paragraphs: ["Hãy liên hệ trong thời hạn hỗ trợ, bảo hành hoặc đổi trả được ghi trên trang sản phẩm/phiên bản. Nếu listing không nêu một thời hạn riêng, hãy gửi yêu cầu ngay khi vấn đề xuất hiện và trước khi tiếp tục dùng, chia sẻ hoặc thay đổi nội dung bàn giao. Với key không hoạt động, liên hệ sớm sau lần thử đầu tiên giúp việc đối chiếu chính xác hơn."],
          note: "Thời hạn theo sản phẩm không làm mất quyền bắt buộc của người tiêu dùng theo pháp luật áp dụng.",
        },
        {
          id: "eligible",
          title: "3. Trường hợp được xem xét",
          paragraphs: ["Một yêu cầu có thể đủ điều kiện để khắc phục, thay thế, credit hoặc hoàn tiền khi TUNG xác minh được một trong các tình huống sau:"],
          bullets: ["Thanh toán trùng cho cùng một đơn hoặc thu sai số tiền do lỗi hệ thống.", "Thanh toán đã xác minh nhưng TUNG không thể bàn giao sản phẩm đã mua.", "Key, link hoặc file được giao sai phiên bản, thiếu phần trọng yếu hoặc khác đáng kể so với mô tả tại thời điểm mua.", "License key không hợp lệ ngay lần kích hoạt đầu, chưa bị sử dụng và lỗi không đến từ thiết bị, vùng hoặc tài khoản của người mua.", "Dịch vụ chưa bắt đầu, chưa giữ lịch/nguồn lực và chưa phát sinh chi phí không thể hủy tại thời điểm nhận yêu cầu.", "Deliverable dịch vụ khác đáng kể với scope đã chấp thuận và không thể khắc phục hợp lý.", "TUNG chấm dứt dự án trước khi hoàn thành; phần trả trước cho công việc chưa thực hiện được đối chiếu theo proposal."],
        },
        {
          id: "not-eligible",
          title: "4. Trường hợp thường không đủ điều kiện",
          paragraphs: ["Trong phạm vi pháp luật cho phép, TUNG thường không hoàn tiền chỉ vì thay đổi ý định sau khi sản phẩm số đã được hiển thị/tải/kích hoạt, hoặc sau khi nguồn lực dự án đã được giữ và công việc đã bắt đầu."],
          bullets: ["Bạn mua nhầm phiên bản dù tên, yêu cầu, thời hạn và hình thức bàn giao đã hiển thị rõ.", "Thiết bị, vùng, tài khoản hoặc phần mềm của bạn không đáp ứng yêu cầu đã công bố.", "Key hoặc quyền truy cập đã được chia sẻ, bán lại, dùng vượt giới hạn hoặc bị khóa do vi phạm điều khoản.", "Nhà cung cấp bên thứ ba thay đổi dịch vụ sau khi sản phẩm đã được bàn giao đúng, trừ khi có cam kết khác.", "Change request, thay đổi ưu tiên hoặc chậm trễ do thiếu nội dung, quyền truy cập hay phản hồi của khách hàng.", "Phần milestone đã nghiệm thu, thời gian đã thực hiện, nguồn lực đã giữ hoặc chi phí bên thứ ba không thể thu hồi.", "Bạn không cung cấp đủ thông tin an toàn cần để xác minh yêu cầu."],
        },
        {
          id: "troubleshooting",
          title: "5. Khắc phục và thay thế trước hoàn tiền",
          paragraphs: ["Nếu vấn đề có thể sửa hợp lý, TUNG có thể đề nghị hướng dẫn cài đặt, kiểm tra yêu cầu, giao lại file/link, thay key chưa sử dụng hoặc sửa phần bàn giao. Việc khắc phục không yêu cầu bạn gửi mật khẩu, OTP hoặc toàn bộ license key qua email."],
        },
        {
          id: "how-to-request",
          title: "6. Cách gửi yêu cầu",
          paragraphs: ["Dùng trang Liên hệ hoặc email hello@tung.codes từ địa chỉ đã mua hàng. Tiêu đề nên có mã đơn và loại yêu cầu."],
          bullets: ["Mã đơn và email dùng khi mua.", "Tên sản phẩm, phiên bản và thời điểm vấn đề xuất hiện.", "Các bước đã thử và thông báo lỗi chính xác.", "Ảnh chụp đã che dữ liệu nhạy cảm nếu ảnh thực sự giúp xác minh.", "Kết quả bạn mong muốn: hỗ trợ, thay thế, giao lại, hủy hoặc hoàn tiền."],
          note: "Không gửi mật khẩu, OTP, order access token, thông tin ngân hàng đầy đủ hoặc license key nguyên vẹn.",
        },
        {
          id: "review-resolution",
          title: "7. Đánh giá và phương án xử lý",
          paragraphs: ["TUNG sẽ xem xét sau khi nhận đủ dữ liệu cần thiết. Thời gian phụ thuộc độ phức tạp, trạng thái kích hoạt, milestone, nhà cung cấp và ngân hàng; mốc phản hồi cụ thể chỉ ràng buộc khi được ghi trong trang sản phẩm, proposal hoặc SLA."],
          bullets: ["Giao lại hoặc thay thế tương đương.", "Credit cho sản phẩm khác nếu bạn đồng ý.", "Hoàn tiền một phần tương ứng phần không thể cung cấp.", "Hoàn tiền toàn phần khi không thể bàn giao hoặc khắc phục hợp lý."],
        },
        {
          id: "refund-method",
          title: "8. Phương thức và thời gian nhận tiền",
          paragraphs: ["Khoản hoàn được gửi về phương thức thanh toán ban đầu khi khả thi; với chuyển khoản, TUNG có thể yêu cầu thông tin tài khoản tối thiểu qua kênh an toàn. Thời gian tiền về sau khi phát hành do ngân hàng hoặc nhà cung cấp quyết định và nằm ngoài khả năng kiểm soát trực tiếp của TUNG."],
        },
        {
          id: "services-partial",
          title: "9. Dịch vụ và khoản hoàn một phần",
          paragraphs: ["Tiền đặt cọc có thể được dùng để giữ lịch, discovery, thiết lập dự án và phân bổ nguồn lực nên không mặc nhiên được hoàn lại sau khi các hoạt động đó bắt đầu. Nếu khách hàng hủy hoặc tạm dừng, TUNG đối chiếu công việc đã làm, milestone đã nghiệm thu, thời gian/nguồn lực đã giữ, license hoặc chi phí bên thứ ba không thể hủy và phần trả trước còn lại. Nếu TUNG hủy, phần trả trước cho công việc chưa thực hiện được hoàn hoặc credit sau đối chiếu. Proposal được ưu tiên khi quy định cụ thể hơn."],
          bullets: ["Yêu cầu hủy cần gửi bằng văn bản qua kênh dự án hoặc email liên hệ.", "Sửa lỗi trong scope được xử lý theo thời hạn review/bảo hành; tính năng mới hoặc thay đổi phạm vi được báo giá riêng.", "Tạm dừng kéo dài có thể cần lịch khởi động lại, chi phí tái lập hoặc proposal mới nếu văn bản dự án đã quy định."],
        },
        {
          id: "abuse-chargebacks-rights",
          title: "10. Lạm dụng, chargeback và quyền bắt buộc",
          paragraphs: ["TUNG có thể từ chối yêu cầu gian lận, lặp lại bất thường hoặc dựa trên bằng chứng bị chỉnh sửa. Hãy liên hệ trước khi chargeback để trạng thái đơn và bàn giao được kiểm tra; việc đó không hạn chế quyền pháp lý bắt buộc. Không nội dung nào trong policy này loại bỏ quyền người tiêu dùng mà pháp luật không cho phép loại bỏ."],
        },
      ],
      contactHeading: "Đơn hàng của bạn có vấn đề?",
      contactBody: "Gửi mã đơn và mô tả ngắn. TUNG sẽ kiểm tra payment state, delivery evidence và phương án khắc phục phù hợp.",
      contactCta: "Yêu cầu hỗ trợ đơn",
      relatedLabel: "Policy liên quan",
    },
  },
  en: {
    terms: {
      slug: "terms-of-service", navLabel: "Terms", metaTitle: "Terms of service — TUNG", metaDescription: "Terms for website design, SaaS development, technical support and digital-product purchases from TUNG.", label: "TERMS / SERVICE", heading: "Clear conditions before work begins.", intro: "These terms distinguish proposal-based website or SaaS services from digital products purchased directly through the shop. A signed proposal, statement of work or separate agreement takes priority for the engagement it governs.", effectiveLabel: "Effective", effectiveDate: "29 July 2026", effectiveIsoDate: "2026-07-29", summaryLabel: "Plain-language summary", summaries: [
        { label: "Service projects", value: "The proposal defines scope, milestones, payment, acceptance and ownership." },
        { label: "Digital products", value: "The listing defines the version, price, licence, fulfilment and included support." },
        { label: "Changes", value: "Out-of-scope requests need an agreed schedule and price impact before work proceeds." },
      ], tocLabel: "In this document", sections: [
        { id: "acceptance", title: "1. Acceptance", paragraphs: ["By using tung.codes, creating an account, submitting a form, placing an order or agreeing a service scope, you accept these terms and linked policies. If you act for an organisation, you confirm you can bind it."] },
        { id: "scope", title: "2. Service scope", paragraphs: ["TUNG operates a portfolio, contact forms, digital shop, customer accounts, payment flows and fulfilment. Products may be licence keys, downloads or manually delivered digital services. The product listing, selected version and stated usage conditions form part of the transaction."], note: "Third-party websites and platforms have their own terms." },
        { id: "accounts", title: "3. Eligibility and accounts", paragraphs: ["You must be legally able to contract and provide accurate information. You are responsible for activity through your account, verified email, order access link and devices."], bullets: ["Do not share passwords, OTPs, login links or licence keys.", "Report unauthorised access or incorrect order data promptly.", "Do not create accounts or orders to evade limits, abuse promotions or harm the service."] },
        { id: "orders", title: "4. Orders and pricing", paragraphs: ["Price, currency, version, inventory and fulfilment are checked again by the backend. Submitting an order is not final acceptance; acceptance occurs after verified payment and confirmation that fulfilment is available. TUNG may cancel for obvious pricing errors, unavailable stock, fraud risk, provider limits or legal requirements."], note: "If a paid order cannot be accepted, the refund policy applies." },
        { id: "payment", title: "5. Payment verification", paragraphs: ["The shop may use VietQR or a supported payment provider. Use the exact amount and order reference. A transfer screenshot does not replace backend verification, and you should not make a second transfer while an order is confirming."], bullets: ["Use payment instructions shown on tung.codes only.", "Keep the order number, but never publish the order access link.", "Bank or third-party fees apply only when stated."] },
        { id: "digital", title: "6. Digital fulfilment and licence", paragraphs: ["Unless a listing says otherwise, a purchase grants a limited, non-exclusive, non-transferable right to use the delivered item. It does not transfer intellectual-property ownership."], bullets: ["Do not resell, publicly share, mass copy, bypass access controls or use the product unlawfully.", "Stay within disclosed user, device, duration and region limits.", "Check system requirements and third-party terms before purchase."] },
        { id: "third-parties", title: "7. Third-party services", paragraphs: ["Some products depend on providers, platforms, APIs or banks that TUNG does not control. Their features, price, region rules or account decisions may change. TUNG cannot grant rights beyond those allowed by the relevant third party."] },
        { id: "professional", title: "8. Proposals, deposits and project start", paragraphs: ["Services may include advisory, UX/UI, landing pages, SME business websites, frontend or backend engineering, integrations, SaaS systems, security, performance/SEO, SME infrastructure, business email, HR/operations modules and technical support. The proposal or statement of work identifies deliverables, exclusions, assumptions, estimated schedule, price, applicable taxes or fees, payment milestones and acceptance criteria."], bullets: ["Work is scheduled or starts after proposal acceptance and verification of the required deposit or first milestone unless the written agreement says otherwise.", "An estimate may change when inputs or scope change; a fixed price applies only to the scope expressly identified as fixed.", "Domain, hosting, plugins, stock assets, APIs and other third-party charges are not included unless stated."], note: "A signed engagement agreement overrides these public terms where they conflict." },
        { id: "collaboration", title: "9. Collaboration, changes and acceptance", paragraphs: ["The client supplies lawful content and brand assets, access, test data, decisions and reasonably timely feedback. Missing inputs, delayed approval or third-party dependencies may move the schedule without constituting delay by TUNG."], bullets: ["Out-of-scope requests require a change request or written confirmation of the effect on price, timing and deliverables.", "TUNG proceeds after agreement, except for correcting a clear defect within the approved scope.", "Review and acceptance follow the proposal. Silence or production use counts as acceptance only when the proposal expressly says so."] },
        { id: "service-ip", title: "10. Project ownership and handover", paragraphs: ["The client retains rights in lawful content, data and materials it supplies. After full payment, ownership or use rights in custom deliverables transfer only as described in the proposal. TUNG and its licensors retain pre-existing tools, reusable components, frameworks, know-how, open-source software and third-party assets."], bullets: ["Source code, design files, operational documents, accounts and credentials are handed over only when included in the agreed deliverables.", "Fonts, plugins, stock assets, APIs and open-source components remain subject to their own licences.", "Each party protects non-public information shared for the engagement; a signed NDA or confidentiality clause takes priority.", "A case study or client attribution uses permitted, proposal-approved or already public information and remains subject to confidentiality duties."] },
        { id: "support", title: "11. Defect warranty, support, hosting and operations", paragraphs: ["Post-launch defect correction, an SLA, maintenance, hosting, backups, monitoring, content updates or operational support apply only when included in a proposal or support plan. A defect warranty does not cover new features, content changes, provider changes or issues caused by client or third-party modifications after handover. TUNG may advise on semantic HTML, accessibility, performance and technical SEO, but does not guarantee an audit score, search ranking, traffic, conversion or absolute accessibility outcome unless the proposal defines a measurable acceptance criterion."], note: "Production domain, cloud, email and analytics accounts should normally remain under client control. Renewal charges and provider compliance belong to the account holder unless agreed otherwise." },
        { id: "acceptable", title: "12. Acceptable use", paragraphs: ["Do not attack the service, run unauthorised vulnerability scans, manipulate payments, scrape at scale, evade rate limits, impersonate others, distribute malware or infringe rights. TUNG may restrict access to protect users, systems or comply with law."] },
        { id: "refunds", title: "13. Cancellations and refunds", paragraphs: ["Cancellation and refund rights are set out in the refund policy. Because digital items may be usable immediately after a key, download or access right is revealed, a change of mind after fulfilment does not automatically create a refund right. Contact TUNG before a chargeback so order and delivery evidence can be reviewed; mandatory rights remain unaffected."] },
        { id: "ip", title: "14. Website and shop intellectual property", paragraphs: ["TUNG and its licensors retain rights in tung.codes, its brand, editorial content, shop software and pre-existing materials. Accessing the website or buying a digital product does not transfer those rights beyond the licence clearly described in the listing."] },
        { id: "liability", title: "15. Warranties and liability", paragraphs: ["TUNG uses reasonable care and aims to describe current product state accurately, but cannot promise uninterrupted or error-free service or control third-party decisions. To the extent permitted by law, total liability for a claim is limited to the amount paid for the order or engagement giving rise to it. This does not exclude liability that cannot legally be excluded."] },
        { id: "changes", title: "16. Changes and disputes", paragraphs: ["Terms may change as services or law change. The effective date will be updated. Parties should first attempt good-faith resolution through the contact channel; applicable mandatory consumer and data rights remain in place."] },
      ], contactHeading: "Need a term clarified?", contactBody: "Send the relevant product URL, order number or proposal. Never include passwords, OTPs or licence keys.", contactCta: "Contact TUNG", relatedLabel: "Related policies",
    },
    privacy: {
      slug: "privacy-policy", navLabel: "Privacy", metaTitle: "Privacy policy — TUNG", metaDescription: "How TUNG handles data for website and SaaS projects, support, accounts and digital-shop transactions.", label: "PRIVACY / DATA", heading: "Collect less. Explain it clearly.", intro: "This policy covers project enquiries, website and SaaS delivery, customer accounts, the digital shop, payments and support on tung.codes. Client project data is distinguished from the information TUNG needs for proposals, contracts, billing, security and operations.", effectiveLabel: "Updated", effectiveDate: "29 July 2026", effectiveIsoDate: "2026-07-29", summaryLabel: "Key points", summaries: [
        { label: "Prospects", value: "Contact, goals, budget and context needed to assess a potential project." },
        { label: "Project data", value: "Content, access and test data are used only to deliver the agreed scope." },
        { label: "Transactions", value: "Accounts, orders, payments and security logs are kept for operational and legal needs." },
      ], tocLabel: "In this policy", sections: [
        { id: "scope", title: "1. Scope and operator", paragraphs: ["This policy applies when TUNG operates tung.codes for portfolio content, contact, accounts, orders, payments, support and professional services. Linked third-party sites have their own policies. Data questions can be sent to hello@tung.codes."] },
        { id: "collection", title: "2. Data collected", paragraphs: ["Data depends on how you use the site and is limited to what is reasonably needed."], bullets: ["Contact details and the message, company, project, budget or timeline you choose to submit.", "Account identity, verified email, login provider, sessions and security events.", "Order items, versions, price, order reference, customer snapshot, optional phone, payment and fulfilment state.", "Payment reference, amount and provider status; the site does not ask to store payment-card numbers.", "Route, time, shortened or hashed User-Agent/IP, request IDs, errors, rate-limit and fraud signals.", "Project briefs, content, designs, repositories, tickets, logs, configuration, account access, staging/test data or other material intentionally supplied for the scope."] },
        { id: "purposes", title: "3. Purposes", paragraphs: ["Data is used to answer enquiries, prepare proposals, manage and deliver projects, secure accounts, verify payments, fulfil products, provide support, prevent abuse, monitor necessary performance or errors, and keep contract, transaction, tax, dispute or legal records."] },
        { id: "basis", title: "4. Processing basis", paragraphs: ["Depending on context and applicable law, processing is necessary to perform or prepare a contract, meet legal obligations, protect legitimate security and fraud-prevention interests, or relies on consent where required."] },
        { id: "project-data", title: "5. Data in client projects", paragraphs: ["When TUNG handles personal data in a client system only to build, test, migrate or support it, the client determines the purpose and is responsible for lawful notices, collection rights and instructions. TUNG follows the scope, documented instructions and any signed data-processing agreement. TUNG separately determines processing needed for proposals, contracts, invoices, security and relationship management."], bullets: ["Prefer synthetic, anonymised or staging data instead of production data where practical.", "Grant least-privilege access through separate accounts and revoke it when the milestone or engagement ends.", "Do not provide sensitive data, secrets or user datasets until suitable handling measures are agreed."], note: "Do not place passwords, private keys or production secrets in an ordinary contact form." },
        { id: "providers", title: "6. Providers", paragraphs: ["Limited-purpose providers may process data to run the service."], bullets: ["Cloudflare for hosting, CDN, security, Turnstile, aggregate analytics and related Worker/email infrastructure.", "PayOS, VietQR, banks and payment partners for instructions, matching and transaction status.", "Google or another login provider only when you choose it.", "Email providers for verification, alerts, order updates and support.", "Telegram only when you actively use an offered bot or commerce channel."], note: "Personal data is not sold or rented to data brokers or ad networks." },
        { id: "storage", title: "7. Cookies, browser storage and analytics", paragraphs: ["No advertising cookies are used. Necessary cookies or browser storage may keep sessions, cart state, language, order access or anti-forgery protection. Cloudflare Web Analytics may collect aggregate metrics and does not receive form content, passwords or licence keys."] },
        { id: "sharing", title: "8. Sharing", paragraphs: ["Data is shared only with required providers, confidential professional advisers, authorities responding to a valid legal request, or a lawful successor to the operation. Access and fields are limited by purpose where reasonably possible."] },
        { id: "international", title: "9. International processing", paragraphs: ["TUNG works between Vietnam and Japan, and cloud, login, email or payment providers may process data in several countries. Appropriate provider settings, contracts and safeguards are used where required."] },
        { id: "retention", title: "10. Retention", paragraphs: ["Data is retained as needed for service, security, support, contracts and transaction, tax, accounting or dispute obligations. Sessions can be short-lived; proposals, invoices, orders, audit trails and payment evidence may be retained longer. Project data and access are reviewed when a milestone or engagement ends, while backups or logs may persist for a limited system lifecycle. Data is deleted, anonymised or removed from routine use when no longer needed where reasonably possible."] },
        { id: "rights", title: "11. Your rights", paragraphs: ["Depending on applicable law, you may request access, a copy, correction, deletion, restriction, objection or withdrawal of consent. Identity may need to be verified, and some records may be retained where law or legitimate rights require it."], bullets: ["Contact hello@tung.codes from the relevant email address.", "Never send passwords, OTPs, order tokens or licence keys as identity proof.", "You may contact the competent data-protection authority if concerns remain."] },
        { id: "security", title: "12. Security", paragraphs: ["Controls include HTTPS, access boundaries, expiring sessions, hashing or encryption where appropriate, rate limits, audits and protected administration. No system is perfectly secure; significant incidents are assessed and notified as required by law."] },
        { id: "children", title: "13. Children and changes", paragraphs: ["Professional services, purchases and account features are not directed to children. If child data is submitted without an appropriate basis, TUNG may delete it or ask a responsible adult to verify the request. This policy may change with services, providers or law; the updated date will be shown here."] },
      ], contactHeading: "Want to check your data?", contactBody: "Use the email connected to the account or order. Include an order number only if needed, and never send passwords, OTPs or licence keys.", contactCta: "Send a data request", relatedLabel: "Related policies",
    },
    refund: {
      slug: "refund-policy", navLabel: "Refunds", metaTitle: "Refund policy — TUNG", metaDescription: "Cancellation, remedy and refund terms for digital products, website or SaaS projects, deposits and service milestones.", label: "REFUNDS / REMEDY", heading: "Decisions follow delivery and work records.", intro: "Shop purchases and service projects follow different cancellation logic. Digital products are reviewed against fulfilment status; website and SaaS engagements are reconciled against the proposal, reserved capacity, completed milestones and committed third-party cost.", effectiveLabel: "Updated", effectiveDate: "29 July 2026", effectiveIsoDate: "2026-07-29", summaryLabel: "How it works", summaries: [
        { label: "Shop", value: "Keys, files and access rights are checked against the listing, activation and fulfilment evidence." },
        { label: "Services", value: "Deposits, milestones, reserved capacity and committed cost are reconciled under the proposal." },
        { label: "Remedy", value: "Correction, redelivery or completion of missing scope comes before an appropriate refund decision." },
      ], tocLabel: "In this policy", sections: [
        { id: "scope", title: "1. Scope", paragraphs: ["This policy covers two distinct groups: (a) licence keys, downloads and directly fulfilled digital products; and (b) deposits, milestones and prepayments for advisory, website design, frontend/backend engineering, integrations, SaaS work or technical support. A listing, proposal, contract or mandatory law controls where it is more specific or gives you better rights."] },
        { id: "window", title: "2. Request window", paragraphs: ["Contact TUNG within the support, warranty or return window shown for the product or version. If no separate window is stated, report the issue promptly and before continuing to use, share or alter the delivered item. Report a non-working key as soon as practical after the first attempt."], note: "Product-specific windows do not reduce mandatory consumer rights." },
        { id: "eligible", title: "3. Potentially eligible cases", paragraphs: ["A remedy, credit or refund may be available for a verified duplicate or incorrect charge, a paid order TUNG cannot fulfil, a materially wrong or incomplete item, an unused key invalid on first activation, a service cancelled before work, capacity reservation or non-cancellable cost begins, a material scope mismatch that cannot reasonably be corrected, or an engagement ended by TUNG before paid work is completed."] },
        { id: "not-eligible", title: "4. Usually not eligible", paragraphs: ["To the extent permitted by law, a change of mind after a digital item is revealed, downloaded or activated, or after project capacity is reserved and work begins, does not normally qualify."], bullets: ["The wrong version was chosen despite clear requirements and delivery details.", "Your device, region, account or software does not meet disclosed requirements.", "Access was shared, resold, overused or suspended for a terms breach.", "A third party changed its service after correct fulfilment, unless promised otherwise.", "A change request, priority change or delay caused by missing client content, access or feedback.", "Accepted milestones, completed time, reserved capacity or non-recoverable third-party cost.", "Required safe verification details are not provided."] },
        { id: "remedy", title: "5. Troubleshooting and replacement", paragraphs: ["Where reasonable, TUNG may first offer setup help, requirement checks, file/link redelivery, replacement of an unused invalid key or correction of the delivered work. Support will not require passwords, OTPs or a full licence key by email."] },
        { id: "request", title: "6. How to request", paragraphs: ["Use the contact page or email hello@tung.codes from the purchase address."], bullets: ["Order number and purchase email.", "Product, version and when the issue appeared.", "Steps tried and exact error message.", "A redacted screenshot only when useful.", "Preferred outcome: support, replacement, redelivery, cancellation or refund."], note: "Never send passwords, OTPs, order access tokens, full banking credentials or an intact licence key." },
        { id: "review", title: "7. Review and resolution", paragraphs: ["TUNG reviews a request after receiving the information reasonably needed. Timing depends on complexity, activation state, milestones, providers and banks; a specific response time is binding only when stated in a listing, proposal or SLA. Resolution may be redelivery, replacement, agreed credit, partial refund or full refund."] },
        { id: "method", title: "8. Refund method", paragraphs: ["Refunds return to the original method where practical. A bank-transfer refund may require minimal account details through a safe channel. Arrival time after issuance is determined by the bank or provider and is outside TUNG's direct control."] },
        { id: "services", title: "9. Professional services", paragraphs: ["A deposit may reserve a schedule, discovery work, project setup and capacity, so it is not automatically refundable after those activities begin. On client cancellation or pause, TUNG reconciles completed work, accepted milestones, reserved time or capacity, non-cancellable licences and third-party cost, and any remaining prepayment. If TUNG cancels, prepayment for unperformed work is refunded or credited after reconciliation. The proposal controls where it is more specific."], bullets: ["Send cancellation in writing through the project channel or contact email.", "In-scope defects follow the review or warranty period; new features and scope changes are quoted separately.", "A long pause may require rescheduling, remobilisation cost or a new proposal where the project agreement provides for it."] },
        { id: "rights", title: "10. Abuse, chargebacks and rights", paragraphs: ["Fraudulent, repeated-abuse or manipulated-evidence claims may be refused. Contact TUNG before a chargeback so payment and delivery records can be reviewed; this does not waive mandatory legal rights. Nothing here removes consumer rights that cannot lawfully be excluded."] },
      ], contactHeading: "Is something wrong with an order?", contactBody: "Send the order number and a short description. TUNG will review payment state, delivery evidence and the appropriate remedy.", contactCta: "Request order support", relatedLabel: "Related policies",
    },
  },
  ja: {
    terms: {
      slug: "terms-of-service", navLabel: "利用規約", metaTitle: "利用規約 — TUNG", metaDescription: "ウェブサイト設計、SaaS開発、技術支援、デジタル商品の購入に適用される条件。", label: "規約 / サービス", heading: "始める前に、条件を明確に。", intro: "本規約は、提案書に基づくウェブサイト・SaaS開発と、ショップで直接購入するデジタル商品を区別して定めます。署名済み提案書、作業範囲書または個別契約は、その案件について優先されます。", effectiveLabel: "発効日", effectiveDate: "2026年7月29日", effectiveIsoDate: "2026-07-29", summaryLabel: "要点", summaries: [
        { label: "受託案件", value: "提案書が範囲、マイルストーン、支払、検収、権利を定めます。" },
        { label: "デジタル商品", value: "商品ページが版、価格、ライセンス、受け渡し、付帯サポートを定めます。" },
        { label: "変更", value: "範囲外の依頼は、費用と日程への影響を合意してから着手します。" },
      ], tocLabel: "目次", sections: [
        { id: "acceptance", title: "1. 規約への同意", paragraphs: ["サイト利用、アカウント作成、フォーム送信、注文、またはサービス範囲への合意により、本規約と関連ポリシーに同意したものとします。組織を代表する場合は、組織を拘束する権限が必要です。"] },
        { id: "scope", title: "2. サービス範囲", paragraphs: ["TUNGはポートフォリオ、問い合わせ、デジタルショップ、顧客アカウント、決済、受け渡しを運営します。商品ページの説明、選択バージョン、利用条件は取引の一部です。"], note: "外部サイトにはそれぞれの規約があります。" },
        { id: "accounts", title: "3. 利用資格とアカウント", paragraphs: ["適用法上の契約能力を持ち、正確な情報を提供してください。アカウント、確認済みメール、注文アクセスリンク、端末から行われる操作は利用者の責任です。"], bullets: ["パスワード、OTP、ログインリンク、キーを共有しない。", "不正アクセスや注文情報の誤りを速やかに報告する。", "制限回避、プロモーション乱用、サービス妨害を行わない。"] },
        { id: "orders", title: "4. 注文と価格", paragraphs: ["価格、通貨、在庫、受け渡しはバックエンドで再確認されます。注文送信だけでは販売成立ではなく、支払確認と受け渡し可能性の確認後に受諾されます。明白な価格誤り、在庫不足、不正リスク、提供元制限、法的要請により取消す場合があります。"] },
        { id: "payment", title: "5. 支払確認", paragraphs: ["VietQRまたは対応する決済提供者を利用する場合があります。正しい金額と注文参照コードを使用してください。振込画像はバックエンド確認の代わりになりません。確認中に同じ注文へ再度支払わないでください。"] },
        { id: "digital", title: "6. デジタル商品の利用権", paragraphs: ["商品ページに別記がない限り、購入により限定的・非独占・譲渡不可の利用権が与えられます。知的財産権は移転しません。"], bullets: ["再販売、公開共有、大量複製、アクセス制御回避、違法利用は禁止です。", "利用者数、端末、期間、地域の条件を守ってください。", "購入前に動作要件と外部サービス規約を確認してください。"] },
        { id: "third", title: "7. 外部サービス", paragraphs: ["商品が外部の提供者、プラットフォーム、API、銀行に依存する場合があります。TUNGはそれらの仕様、価格、地域条件、アカウント判断を管理できず、外部提供者が許可する以上の権利を付与できません。"] },
        { id: "professional", title: "8. 提案書、着手金、開始条件", paragraphs: ["サービスには、コンサルティング、UX/UI、ランディングページ、中小企業向けサイト、フロントエンド・バックエンド、連携、SaaS、セキュリティ、性能・SEO改善、業務基盤、ビジネスメール、HR・業務モジュール、技術支援が含まれ得ます。提案書または作業範囲書が、納品物、対象外、前提、予定期間、価格、税・費用、支払、検収条件を定めます。"], bullets: ["別段の記載がない限り、提案書の承認と着手金または初回マイルストーンの入金確認後に日程確保・作業開始となります。", "入力情報や範囲が変われば見積りも変わり得ます。固定価格は明示された固定範囲にのみ適用されます。", "ドメイン、ホスティング、プラグイン、素材、API等の外部費用は、明記がなければ含まれません。"], note: "矛盾がある場合、署名済み契約が優先されます。" },
        { id: "collaboration", title: "9. 協力、変更、検収", paragraphs: ["顧客は、適法に利用できるコンテンツ・ブランド素材、アクセス、テストデータ、判断、合理的に迅速なフィードバックを提供します。不足、承認遅延、外部依存により日程が変わる場合、それ自体はTUNGの遅延とは扱いません。"], bullets: ["範囲外依頼は、価格・日程・納品物への影響を書面で合意します。", "明確な範囲内不具合の修正を除き、合意後に変更作業へ進みます。", "検収は提案書に従います。無回答や本番利用が検収となるのは、提案書に明記された場合のみです。"] },
        { id: "service-ip", title: "10. 案件の権利と引渡し", paragraphs: ["顧客は提供した適法なコンテンツ・データ・資料の権利を保持します。全額支払後、カスタム成果物の所有権または利用権は提案書の範囲でのみ移転します。既存ツール、再利用部品、framework、know-how、open-source、外部素材の権利はTUNGまたは各権利者に残ります。"], bullets: ["source code、design file、運用資料、account、credentialは合意した納品物に含まれる場合のみ引き渡します。", "font、plugin、stock asset、API、open-sourceには各ライセンスが継続適用されます。", "各当事者は案件で共有された非公開情報を保護し、締結済みNDA・守秘条項が優先されます。", "case studyや顧客名の掲載は、許可済み・提案書記載・公開済み情報に限り、守秘義務を維持します。"] },
        { id: "support", title: "11. 不具合保証、支援、hosting、運用", paragraphs: ["公開後の不具合修正、SLA、保守、hosting、backup、監視、コンテンツ更新、運用支援は、提案書または支援プランに含まれる場合のみ適用されます。不具合保証は、新機能、内容変更、提供元変更、引渡し後の顧客・第三者による改変を対象としません。semantic HTML、accessibility、性能、技術SEOを助言できますが、提案書に測定可能な検収条件がない限り、audit score、検索順位、traffic、conversion、完全なaccessibilityは保証しません。"], note: "本番domain、cloud、email、analyticsのaccountは通常顧客管理とし、別段の合意がなければ名義人が更新費と提供元規約への対応を負います。" },
        { id: "acceptable", title: "12. 許容される利用", paragraphs: ["攻撃、無許可の脆弱性スキャン、決済操作、大量収集、レート制限回避、なりすまし、マルウェア配布、権利侵害は禁止です。安全や法令遵守のためアクセスを制限する場合があります。"] },
        { id: "refund", title: "13. 取消しと返金", paragraphs: ["返金ポリシーが適用されます。キー、ダウンロード、アクセス権の受け渡し後は直ちに利用できるため、単なる心変わりは自動的な返金理由になりません。チャージバック前に連絡してください。法定権利は維持されます。"] },
        { id: "ip", title: "14. サイト・ショップの知的財産", paragraphs: ["tung.codes、ブランド、編集コンテンツ、ショップソフトウェア、既存資料の権利はTUNGまたは権利者に留保されます。サイト閲覧や商品購入によって、商品ページに明記したライセンスを超える権利は移転しません。"] },
        { id: "liability", title: "15. 保証と責任", paragraphs: ["TUNGは合理的な注意を払い現状を正確に説明しますが、常時無停止・無エラー、外部サービスの継続を保証できません。法が許す範囲で、責任総額は請求原因となった注文または協業への支払額を上限とします。法的に除外できない責任は除きます。"] },
        { id: "changes", title: "16. 変更と紛争", paragraphs: ["サービスや法令の変更に応じて規約を更新することがあります。発効日を更新し、まず連絡窓口を通じて誠実な解決を試みます。強行法規上の権利は維持されます。"] },
      ], contactHeading: "規約について質問がありますか？", contactBody: "対象の商品URL、注文番号、提案書を添えてください。パスワード、OTP、キーは送らないでください。", contactCta: "TUNGへ連絡", relatedLabel: "関連ポリシー",
    },
    privacy: {
      slug: "privacy-policy", navLabel: "プライバシー", metaTitle: "プライバシーポリシー — TUNG", metaDescription: "ウェブサイト・SaaS案件、支援、アカウント、デジタルショップでのデータ処理。", label: "プライバシー / データ", heading: "集める量を抑え、明確に説明する。", intro: "本ポリシーは、案件相談、ウェブサイト・SaaS開発、アカウント、デジタルショップ、決済、支援に適用されます。顧客の案件データと、提案・契約・請求・安全・運営にTUNGが必要とするデータを区別します。", effectiveLabel: "更新日", effectiveDate: "2026年7月29日", effectiveIsoDate: "2026-07-29", summaryLabel: "要点", summaries: [
        { label: "見込み顧客", value: "案件評価に必要な連絡先、目的、予算、背景。" },
        { label: "案件データ", value: "合意範囲の実施に必要な内容、アクセス、テストデータ。" },
        { label: "取引", value: "アカウント、注文、決済、安全ログを運営・法的必要性に応じ保持。" },
      ], tocLabel: "目次", sections: [
        { id: "scope", title: "1. 適用範囲", paragraphs: ["TUNGがポートフォリオ、問い合わせ、アカウント、注文、決済、サポート、専門サービスのためtung.codesを運営する際に適用されます。外部サイトには独自のポリシーがあります。問い合わせ先はhello@tung.codesです。"] },
        { id: "collection", title: "2. 収集するデータ", paragraphs: ["利用方法に応じ、合理的に必要な情報だけを扱います。"], bullets: ["氏名、メール、会社、プロジェクト、予算、期間、メッセージ。", "確認済みメール、ログイン提供者、セッション、セキュリティイベント。", "商品、バージョン、価格、注文参照、任意の電話、支払・受け渡し状態。", "決済参照、金額、提供者の状態。カード番号の保存は求めません。", "時刻、route、短縮またはハッシュ化したUser-Agent/IP、request ID、エラー、不正防止信号。", "brief、content、design、repository、ticket、log、configuration、account access、staging/test data等、合意範囲のため意図的に提供された資料。"] },
        { id: "purposes", title: "3. 利用目的", paragraphs: ["問い合わせ対応、提案書作成、案件管理・実施、アカウント保護、支払確認、商品受け渡し、支援、不正防止、必要な性能・エラー確認、契約・取引・税務・紛争・法令上の記録に利用します。"] },
        { id: "basis", title: "4. 処理の根拠", paragraphs: ["契約の履行・準備、法的義務、セキュリティや不正防止の正当な利益、必要な場合の同意に基づき処理します。"] },
        { id: "project-data", title: "5. 顧客案件内のデータ", paragraphs: ["顧客システムの構築、テスト、移行、支援のためだけに個人データを扱う場合、顧客が目的を決定し、適法な通知・収集権限・指示に責任を負います。TUNGは合意範囲、記録された指示、締結済みのデータ処理契約に従います。提案、契約、請求、安全、関係管理に必要なデータについてはTUNGが別途処理目的を決定します。"], bullets: ["可能なら本番データではなく合成・匿名化・staging dataを使う。", "専用accountで最小権限を付与し、milestoneまたは案件終了時に取り消す。", "取扱方法を合意する前に機微データ、secret、user datasetを提供しない。"], note: "通常の問い合わせフォームへpassword、private key、production secretを入力しないでください。" },
        { id: "providers", title: "6. 提供者", paragraphs: ["目的を限定した提供者が処理する場合があります。"], bullets: ["Cloudflare：hosting、CDN、セキュリティ、Turnstile、集計分析、Worker・メール基盤。", "PayOS、VietQR、銀行：支払案内、照合、取引状態。", "Google等：選択したログイン。", "メール提供者：認証、警告、注文更新、サポート。", "Telegram：利用者がbotや販売チャネルを使う場合のみ。"], note: "data brokerや広告ネットワークへ個人データを販売・貸与しません。" },
        { id: "storage", title: "7. Cookie・保存・分析", paragraphs: ["広告Cookieは使いません。必要なCookieやブラウザ保存は、ログイン、カート、言語、注文アクセス、不正防止に使われます。Cloudflare Web Analyticsは集計値を扱い、フォーム内容、パスワード、キーを受け取りません。"] },
        { id: "sharing", title: "8. 共有", paragraphs: ["必要な提供者、守秘義務を負う助言者、適法な要請を行う当局、合法的な事業承継先に限って共有します。合理的な範囲で目的に応じて項目と権限を制限します。"] },
        { id: "international", title: "9. 国際処理", paragraphs: ["TUNGはベトナムと日本の間で活動し、cloud、login、email、payment提供者が複数国で処理する場合があります。必要に応じ契約、設定、保護措置を利用します。"] },
        { id: "retention", title: "10. 保存期間", paragraphs: ["サービス、安全、支援、契約、取引、税務、会計、紛争に必要な期間保存します。sessionは短期間、提案書、invoice、注文、audit、支払証拠は長期間の場合があります。案件データとアクセスはmilestone・案件終了時に見直し、backupやlogは限定的なsystem lifecycleの間残る場合があります。不要になれば合理的に削除、匿名化、通常利用から分離します。"] },
        { id: "rights", title: "11. 利用者の権利", paragraphs: ["適用法に応じ、アクセス、コピー、訂正、削除、制限、異議、同意撤回を依頼できます。本人確認が必要な場合があり、法的に必要な記録は保持する場合があります。"], bullets: ["関連メールからhello@tung.codesへ連絡。", "本人確認にパスワード、OTP、注文token、キーを送らない。", "懸念が残る場合は管轄のデータ保護機関へ相談できます。"] },
        { id: "security", title: "12. セキュリティ", paragraphs: ["HTTPS、権限境界、期限付きsession、適切なhash・暗号化、rate limit、audit、管理画面保護を利用します。完全な安全は保証できず、重大な事故は法令に従って評価・通知します。"] },
        { id: "children", title: "13. 子どもと変更", paragraphs: ["専門サービス、購入、アカウント機能は子どもを対象としません。適切な根拠なく子どものデータが送信された場合、削除または責任ある成人への確認を行うことがあります。サービス、提供者、法令の変更時は更新日を表示します。"] },
      ], contactHeading: "自分のデータを確認しますか？", contactBody: "アカウントまたは注文に関連するメールからご連絡ください。パスワード、OTP、キーは送らないでください。", contactCta: "データ請求を送る", relatedLabel: "関連ポリシー",
    },
    refund: {
      slug: "refund-policy", navLabel: "返金", metaTitle: "返金ポリシー — TUNG", metaDescription: "デジタル商品、ウェブ・SaaS案件、着手金、マイルストーンの取消し・修正・返金条件。", label: "返金 / 対応", heading: "受け渡しと作業記録に基づいて判断する。", intro: "ショップ購入と受託案件では取消しの考え方が異なります。デジタル商品は受け渡し状態を確認し、ウェブ・SaaS案件は提案書、確保済みリソース、完了マイルストーン、確定した外部費用を精算します。", effectiveLabel: "更新日", effectiveDate: "2026年7月29日", effectiveIsoDate: "2026-07-29", summaryLabel: "流れ", summaries: [
        { label: "ショップ", value: "key、file、access rightを商品説明、activation、受け渡し証拠で確認。" },
        { label: "受託サービス", value: "着手金、milestone、確保済みcapacity、確定費用を提案書に従い精算。" },
        { label: "是正", value: "返金判断の前に、修正、再送、未完範囲の完了を優先。" },
      ], tocLabel: "目次", sections: [
        { id: "scope", title: "1. 適用範囲", paragraphs: ["(a) license key、download、直接受け渡すデジタル商品と、(b) コンサルティング、website design、frontend/backend、integration、SaaS、技術支援の着手金・milestone・前払金を区別して適用します。商品ページ、提案書、契約、強行法規がより具体的または有利な場合はそちらが優先されます。"] },
        { id: "window", title: "2. 申請期限", paragraphs: ["商品またはバージョンに表示されたサポート・保証・返品期間内に連絡してください。個別期間の記載がない場合は、受け渡し内容を使い続けたり共有・変更したりする前に速やかに報告してください。動作しないキーは初回試行後できるだけ早く連絡してください。"], note: "商品別期間は法定消費者権利を制限しません。" },
        { id: "eligible", title: "3. 対象となり得る場合", paragraphs: ["重複・誤請求、支払済みだが受け渡し不能、説明と大きく異なる商品、初回から無効で未使用のキー、作業・日程確保・取消不能費用の発生前のサービス取消し、合理的に修正できない重大な範囲不一致、TUNG都合で未完了となった協業は、修正、credit、返金の対象となる場合があります。"] },
        { id: "not", title: "4. 通常対象外", paragraphs: ["法が許す範囲で、デジタル商品の表示・download・activation後、または案件のcapacity確保・作業開始後の心変わりは通常返金対象ではありません。"], bullets: ["明示された条件にもかかわらず誤った版を選択。", "端末、地域、アカウント、ソフトが要件を満たさない。", "共有、再販売、超過利用、規約違反による停止。", "正しい受け渡し後の外部サービス変更。", "change request、優先順位変更、顧客の内容・access・feedback不足による遅延。", "検収済みmilestone、完了時間、確保済みcapacity、回収不能な外部費用。", "安全な確認情報を提供できない。"] },
        { id: "remedy", title: "5. 修正と交換", paragraphs: ["合理的な場合、設定支援、要件確認、file/link再送、未使用無効キーの交換、成果物修正を先に提案します。パスワード、OTP、完全なキーをメールで求めません。"] },
        { id: "request", title: "6. 申請方法", paragraphs: ["購入メールから問い合わせページまたはhello@tung.codesへ連絡してください。"], bullets: ["注文番号と購入メール。", "商品、版、問題発生時刻。", "試した手順と正確なエラー。", "必要な場合のみ機密情報を隠した画像。", "希望する対応。"], note: "パスワード、OTP、注文token、完全な銀行情報、キーは送らないでください。" },
        { id: "review", title: "7. 審査と解決", paragraphs: ["合理的に必要な情報が揃ってから審査します。期間は複雑性、activation、milestone、提供者、銀行に左右され、商品ページ、提案書、SLAに記載された場合のみ具体的な応答期限が拘束力を持ちます。再送、交換、credit、一部または全額返金で対応します。"] },
        { id: "method", title: "8. 返金方法", paragraphs: ["可能な限り元の支払方法へ返します。銀行振込では安全な経路で最小限の口座情報が必要な場合があります。発行後の着金時期は銀行・提供者が決定し、TUNGの直接管理外です。"] },
        { id: "services", title: "9. 専門サービス", paragraphs: ["着手金は日程、discovery、案件設定、capacityの確保に使われるため、開始後は自動的に返金されません。顧客による取消し・停止時は、完了作業、検収済みmilestone、確保時間・capacity、取消不能なlicense・外部費用、残前払額を精算します。TUNGが取消す場合、未実施作業分は精算後に返金またはcreditとします。具体的な提案書が優先されます。"], bullets: ["取消しは案件チャネルまたは連絡メールから書面で送る。", "範囲内不具合はreview・保証期間で扱い、新機能や範囲変更は別見積り。", "長期停止後は、契約に定めがあれば再日程、再立上げ費用、新提案が必要になる場合があります。"] },
        { id: "rights", title: "10. 不正、chargeback、法定権利", paragraphs: ["不正、反復乱用、加工証拠による請求は拒否する場合があります。chargeback前に連絡してください。ただし法定権利を放棄するものではなく、排除できない消費者権利は維持されます。"] },
      ], contactHeading: "注文に問題がありますか？", contactBody: "注文番号と短い説明を送ってください。支払状態、受け渡し証拠、適切な対応を確認します。", contactCta: "注文サポートを依頼", relatedLabel: "関連ポリシー",
    },
  },
  zh: {
    terms: {
      slug: "terms-of-service", navLabel: "服务条款", metaTitle: "服务条款 — TUNG", metaDescription: "适用于网站设计、SaaS开发、技术支持和数字商品购买的条款。", label: "条款 / 服务", heading: "开始之前，把条件说清楚。", intro: "本条款区分按方案执行的网站/SaaS服务与通过商店直接购买的数字商品。已签署的方案、工作说明书或单独协议在其适用项目中优先。", effectiveLabel: "生效日期", effectiveDate: "2026年7月29日", effectiveIsoDate: "2026-07-29", summaryLabel: "简明摘要", summaries: [
        { label: "服务项目", value: "方案规定范围、里程碑、付款、验收和权利归属。" },
        { label: "数字商品", value: "商品页规定版本、价格、许可、交付和所含支持。" },
        { label: "变更", value: "范围外请求需先确认对费用和时间的影响再执行。" },
      ], tocLabel: "本文内容", sections: [
        { id: "acceptance", title: "1. 接受条款", paragraphs: ["使用tung.codes、创建账户、提交表单、下单或同意服务范围，即表示接受本条款及相关政策。代表组织使用时，你确认有权约束该组织。"] },
        { id: "scope", title: "2. 服务范围", paragraphs: ["TUNG运营作品集、联系表、数字商店、客户账户、支付和交付流程。商品页面说明、所选版本和使用条件构成交易的一部分。"], note: "第三方网站和平台适用其各自条款。" },
        { id: "accounts", title: "3. 使用资格与账户", paragraphs: ["你应具备适用法律要求的缔约能力并提供准确信息。通过账户、已验证邮箱、订单访问链接和设备进行的活动由你负责。"], bullets: ["不要分享密码、验证码、登录链接或密钥。", "发现未授权访问或订单错误时尽快报告。", "不得通过多账户规避限制、滥用优惠或损害服务。"] },
        { id: "orders", title: "4. 订单与价格", paragraphs: ["价格、币种、版本、库存和交付会由后端再次验证。提交订单并不代表最终接受；支付验证且确认可交付后订单才被接受。明显价格错误、缺货、欺诈风险、供应商限制或法律要求可能导致取消。"] },
        { id: "payment", title: "5. 支付验证", paragraphs: ["商店可能使用VietQR或支持的支付服务。请使用准确金额和订单参考码。转账截图不能替代后端验证，订单确认中请勿重复付款。"] },
        { id: "digital", title: "6. 数字商品使用权", paragraphs: ["除商品页面另有说明外，购买只授予有限、非独占、不可转让的使用权，不转移知识产权。"], bullets: ["不得转售、公开分享、大量复制、绕过访问控制或违法使用。", "遵守披露的用户、设备、期限和地区限制。", "购买前检查系统要求和第三方条款。"] },
        { id: "third", title: "7. 第三方服务", paragraphs: ["部分商品依赖TUNG无法控制的供应商、平台、API或银行。其功能、价格、地区规则和账户决定可能变化。TUNG不能授予超过第三方允许范围的权利。"] },
        { id: "professional", title: "8. 方案、定金与项目启动", paragraphs: ["服务可包括咨询、UX/UI、落地页、中小企业网站、前后端开发、集成、SaaS、安全、性能与SEO优化、企业基础设施、商务邮箱、HR/运营模块和技术支持。方案或工作说明书规定交付物、排除项、假设、预计时间、价格、税费、付款节点和验收条件。"], bullets: ["除非书面约定不同，方案获确认且定金或首个里程碑款验证后才排期或启动。", "输入或范围变化时估价可调整；固定价仅适用于明确标为固定的范围。", "域名、托管、插件、素材、API和其他第三方费用除非写明，否则不包含。"], note: "发生冲突时，已签署协议优先。" },
        { id: "collaboration", title: "9. 协作、变更与验收", paragraphs: ["客户应及时提供有权使用的内容和品牌资产、访问权限、测试数据、决策与合理反馈。资料缺失、审批延迟或第三方依赖可能顺延时间，不视为TUNG延迟。"], bullets: ["范围外请求需通过变更请求或书面确认价格、时间和交付物影响。", "除修复已批准范围内的明确缺陷外，双方同意后再执行变更。", "评审和验收按方案进行；沉默或上线仅在方案明确规定时才视为验收。"] },
        { id: "service-ip", title: "10. 项目权利与移交", paragraphs: ["客户保留其合法提供的内容、数据和材料权利。全额付款后，自定义交付物的所有权或使用权仅按方案规定转移。TUNG或许可方保留既有工具、可复用组件、框架、know-how、开源软件和第三方资产权利。"], bullets: ["源代码、设计文件、运维文档、账户和凭据仅在属于约定交付物时移交。", "字体、插件、素材、API和开源组件继续受各自许可约束。", "双方保护为项目共享的非公开信息；已签NDA或保密条款优先。", "案例展示或客户署名仅使用获许可、方案约定或已公开信息，并继续遵守保密义务。"] },
        { id: "support", title: "11. 缺陷保修、支持、托管与运维", paragraphs: ["上线后的缺陷修复、SLA、维护、托管、备份、监控、内容更新或运维支持，仅在方案或支持计划包含时适用。缺陷保修不包括新功能、内容变更、服务商变化或移交后客户/第三方修改造成的问题。TUNG可就语义化HTML、可访问性、性能和技术SEO提供建议，但除非方案定义可测量验收标准，不保证审计分数、搜索排名、流量、转化或绝对可访问性。"], note: "生产域名、云、邮箱和分析账户通常应由客户控制；除另有约定，账户持有人承担续费及遵守服务商条款。" },
        { id: "acceptable", title: "12. 可接受使用", paragraphs: ["不得攻击、未经授权扫描漏洞、操纵支付、大规模抓取、绕过限流、冒充他人、传播恶意软件或侵犯权利。为保护用户、系统或遵守法律，TUNG可限制访问。"] },
        { id: "refund", title: "13. 取消与退款", paragraphs: ["退款政策适用。数字商品在密钥、下载或访问权交付后即可使用，因此交付后的改变主意不自动产生退款权。发起拒付前请先联系；强制性法定权利不受影响。"] },
        { id: "ip", title: "14. 网站与商店知识产权", paragraphs: ["tung.codes、品牌、编辑内容、商店软件和既有材料的权利归TUNG或许可方。访问网站或购买数字商品不会转移商品页明确许可之外的权利。"] },
        { id: "liability", title: "15. 保证与责任", paragraphs: ["TUNG以合理谨慎提供服务并尽力准确描述当前状态，但不能保证服务永不中断、无错误或控制第三方决定。在法律允许范围内，总责任不超过引发索赔的订单或合作已支付金额；法律禁止排除的责任除外。"] },
        { id: "changes", title: "16. 变更与争议", paragraphs: ["服务或法律变化时可更新条款，并更新生效日期。争议应先通过联系渠道善意解决；适用的强制消费者权利仍然有效。"] },
      ], contactHeading: "需要解释某项条款？", contactBody: "请附相关商品URL、订单号或方案。不要发送密码、验证码或许可证密钥。", contactCta: "联系TUNG", relatedLabel: "相关政策",
    },
    privacy: {
      slug: "privacy-policy", navLabel: "隐私政策", metaTitle: "隐私政策 — TUNG", metaDescription: "TUNG如何处理网站/SaaS项目、支持、账户和数字商店交易中的数据。", label: "隐私 / 数据", heading: "少收集，讲清楚。", intro: "本政策适用于项目咨询、网站与SaaS交付、客户账户、数字商店、支付和支持。客户项目数据与TUNG为方案、合同、账单、安全和运营所需的数据分别说明。", effectiveLabel: "更新日期", effectiveDate: "2026年7月29日", effectiveIsoDate: "2026-07-29", summaryLabel: "要点", summaries: [
        { label: "潜在客户", value: "评估项目所需的联系、目标、预算和背景。" },
        { label: "项目数据", value: "内容、访问和测试数据仅用于执行约定范围。" },
        { label: "交易", value: "账户、订单、支付和安全日志按运营及法律需要保留。" },
      ], tocLabel: "本政策内容", sections: [
        { id: "scope", title: "1. 范围与运营者", paragraphs: ["TUNG为作品集、联系、账户、订单、支付、支持和专业服务运营tung.codes时适用本政策。第三方网站有自己的政策。数据问题可发至hello@tung.codes。"] },
        { id: "collection", title: "2. 收集的数据", paragraphs: ["数据取决于你的使用方式，并尽量限于合理必要范围。"], bullets: ["姓名、邮箱、公司、项目、预算、时间和消息。", "已验证邮箱、登录服务、会话和安全事件。", "商品、版本、价格、订单参考、可选电话、支付和交付状态。", "支付参考、金额和服务商状态；网站不要求存储银行卡号。", "时间、route、截短或哈希的User-Agent/IP、request ID、错误、限流和欺诈信号。", "项目brief、内容、设计、repository、ticket、log、configuration、账户访问、staging/test data或你为约定范围主动提供的其他资料。"] },
        { id: "purposes", title: "3. 使用目的", paragraphs: ["用于回复联系、准备方案、管理和交付项目、保护账户、验证支付、交付商品、提供支持、防止滥用、监测必要的性能或错误，以及保留合同、交易、税务、争议或法律记录。"] },
        { id: "basis", title: "4. 处理依据", paragraphs: ["视情境和适用法律，处理用于履行或准备合同、遵守法律义务、保护安全和反欺诈的合法利益，或在需要时基于同意。"] },
        { id: "project-data", title: "5. 客户项目中的数据", paragraphs: ["当TUNG仅为构建、测试、迁移或支持客户系统而处理其中的个人数据时，客户决定目的，并负责合法通知、收集权限和指示。TUNG按照约定范围、记录的指示和已签数据处理协议执行。TUNG另行决定方案、合同、账单、安全和客户关系管理所需的数据处理。"], bullets: ["可行时优先使用合成、匿名或staging data而非生产数据。", "通过独立账户授予最小权限，并在里程碑或项目结束时撤销。", "在约定适当处理措施前，不要提供敏感数据、secret或用户数据集。"], note: "不要在普通联系表中提交密码、private key或production secret。" },
        { id: "providers", title: "6. 服务提供商", paragraphs: ["为有限目的，以下服务商可能处理数据。"], bullets: ["Cloudflare：托管、CDN、安全、Turnstile、汇总分析及Worker/邮件基础设施。", "PayOS、VietQR、银行：支付指引、匹配和交易状态。", "Google等：仅在你选择相应登录时。", "邮件服务商：验证、提醒、订单更新和支持。", "Telegram：仅在你主动使用bot或交易渠道时。"], note: "个人数据不会出售或出租给数据经纪商或广告网络。" },
        { id: "storage", title: "7. Cookie、浏览器存储与分析", paragraphs: ["不使用广告Cookie。必要Cookie或浏览器存储可用于登录、购物车、语言、订单访问和防伪。Cloudflare Web Analytics可收集汇总指标，不接收表单内容、密码或许可证密钥。"] },
        { id: "sharing", title: "8. 分享", paragraphs: ["只与必要服务商、承担保密义务的顾问、提出有效法律要求的机关或合法继任者分享。合理情况下按目的限制字段和权限。"] },
        { id: "international", title: "9. 跨境处理", paragraphs: ["TUNG在越南和日本之间工作，云、登录、邮件或支付服务商可能在多个国家处理数据。需要时使用合约、服务配置和适当保护措施。"] },
        { id: "retention", title: "10. 保留期限", paragraphs: ["数据会在服务、安全、支持、合同、交易、税务、会计或争议需要的期限内保留。会话可能较短；方案、账单、订单、审计和支付证据可能更长。项目数据和访问会在里程碑或项目结束时复核，备份或日志可能按有限系统周期继续存在。不再需要时会在合理可行范围内删除、匿名化或移出日常使用。"] },
        { id: "rights", title: "11. 你的权利", paragraphs: ["根据适用法律，你可请求访问、副本、更正、删除、限制、反对或撤回同意。可能需要验证身份，法律或合法权利要求的记录可能继续保留。"], bullets: ["使用相关邮箱联系hello@tung.codes。", "不要以密码、验证码、订单token或密钥证明身份。", "仍有疑虑时可联系有管辖权的数据保护机构。"] },
        { id: "security", title: "12. 安全", paragraphs: ["使用HTTPS、权限边界、限时会话、适当哈希或加密、限流、审计和受保护管理访问。任何系统都无法绝对安全；重大事件会按法律要求评估和通知。"] },
        { id: "children", title: "13. 儿童与变更", paragraphs: ["专业服务、购买和账户功能不面向儿童。若儿童数据在无适当依据时被提交，TUNG可删除或要求负责成人核实。服务、提供商或法律变化时会更新政策并显示更新日期。"] },
      ], contactHeading: "想查看自己的数据？", contactBody: "请使用账户或订单关联邮箱联系。不要发送密码、验证码或许可证密钥。", contactCta: "提交数据请求", relatedLabel: "相关政策",
    },
    refund: {
      slug: "refund-policy", navLabel: "退款政策", metaTitle: "退款政策 — TUNG", metaDescription: "数字商品、网站/SaaS项目、定金与服务里程碑的取消、补救和退款条款。", label: "退款 / 补救", heading: "依据交付和工作记录处理。", intro: "商店购买与服务项目采用不同取消逻辑。数字商品按交付状态审查；网站/SaaS项目按方案、已预留资源、已完成里程碑和已承诺第三方费用核算。", effectiveLabel: "更新日期", effectiveDate: "2026年7月29日", effectiveIsoDate: "2026-07-29", summaryLabel: "如何处理", summaries: [
        { label: "商店", value: "密钥、文件和访问权按商品描述、激活与交付证据核查。" },
        { label: "服务", value: "定金、里程碑、预留资源和承诺成本按方案核算。" },
        { label: "补救", value: "优先修正、重新交付或补全缺失范围，再决定适当退款。" },
      ], tocLabel: "本政策内容", sections: [
        { id: "scope", title: "1. 范围", paragraphs: ["本政策区分两类：(a)许可证密钥、下载和直接交付的数字商品；(b)咨询、网站设计、前后端、集成、SaaS或技术支持的定金、里程碑和预付款。商品页、方案、合同或强制法律更具体或提供更有利权利时，以其为准。"] },
        { id: "window", title: "2. 请求期限", paragraphs: ["请在商品或版本页面标明的支持、保修或退换期限内联系。若没有单独期限，请在继续使用、分享或修改交付内容前尽快报告问题。密钥首次无法使用时应尽快联系。"], note: "商品特定期限不会减少强制消费者权利。" },
        { id: "eligible", title: "3. 可能符合的情况", paragraphs: ["经验证的重复/错误扣款、已付款但无法交付、与描述明显不符或缺失的重要内容、首次激活即无效且未使用的密钥、工作/排期/不可取消成本开始前取消的服务、无法合理修正的重大范围偏差、TUNG提前终止且未完成的合作，可能获得修复、额度或退款。"] },
        { id: "not", title: "4. 通常不符合", paragraphs: ["在法律允许范围内，数字商品显示、下载或激活后，或项目资源已预留并开始工作后，仅因改变主意通常不退款。"], bullets: ["在要求清楚的情况下选错版本。", "设备、地区、账户或软件不满足已披露要求。", "分享、转售、超限使用或因违规被停用。", "正确交付后第三方改变服务。", "变更请求、优先级变化，或因客户缺少内容、访问或反馈造成的延迟。", "已验收里程碑、已完成工时、预留资源或不可收回第三方成本。", "无法提供必要的安全验证信息。"] },
        { id: "remedy", title: "5. 故障排查与更换", paragraphs: ["合理情况下可先提供设置帮助、要求检查、重新发送文件/链接、更换未使用的无效密钥或修正交付物。支持不会要求通过邮件发送密码、验证码或完整密钥。"] },
        { id: "request", title: "6. 如何申请", paragraphs: ["使用购买邮箱通过联系页或hello@tung.codes提交。"], bullets: ["订单号和购买邮箱。", "商品、版本及问题时间。", "已尝试步骤和准确错误。", "仅在有帮助时提供已遮盖敏感信息的截图。", "希望的处理结果。"], note: "不要发送密码、验证码、订单访问token、完整银行凭据或完整密钥。" },
        { id: "review", title: "7. 审核与解决", paragraphs: ["在收到合理所需信息后审核。时间取决于复杂度、激活状态、里程碑、服务商和银行；只有商品页、方案或SLA写明的具体响应时间具有约束力。解决方式可为重新交付、更换、双方同意的额度、部分或全额退款。"] },
        { id: "method", title: "8. 退款方式", paragraphs: ["可行时退回原支付方式。银行转账退款可能通过安全渠道要求最少账户信息。发出后的到账时间由银行或服务商决定，不在TUNG直接控制范围内。"] },
        { id: "services", title: "9. 专业服务", paragraphs: ["定金可用于排期、discovery、项目设置和资源预留，因此相关活动开始后不自动退款。客户取消或暂停时，会核算已完成工作、已验收里程碑、预留时间/资源、不可取消的许可证与第三方成本，以及剩余预付款。若TUNG取消，未执行工作对应的预付款在核算后退款或转为额度。更具体的方案优先。"], bullets: ["通过项目渠道或联系邮箱以书面方式取消。", "范围内缺陷按评审/保修期处理；新功能或范围变更单独报价。", "长期暂停后，如项目协议有规定，可能需要重新排期、重新启动费用或新方案。"] },
        { id: "rights", title: "10. 滥用、拒付与法定权利", paragraphs: ["欺诈、重复滥用或篡改证据的请求可能被拒绝。发起拒付前请先联系，以便核查支付和交付；这不放弃强制法定权利，也不排除法律禁止排除的消费者权利。"] },
      ], contactHeading: "订单出现问题？", contactBody: "请发送订单号和简短说明。TUNG会检查支付状态、交付证据和合适的补救方式。", contactCta: "请求订单支持", relatedLabel: "相关政策",
    },
  },
} satisfies Record<Locale, LegalLocaleCopy>;

export function getPolicyCopy(locale: Locale, kind: PolicyKind): PolicyCopy {
  return legalCopy[locale][kind];
}

export function getLegalNav(locale: Locale) {
  const copy = legalCopy[locale];
  return (["terms", "privacy", "refund"] as const).map((kind) => ({
    kind,
    href: kind === "privacy" ? "/privacy" : `/${copy[kind].slug}`,
    label: copy[kind].navLabel,
  }));
}
