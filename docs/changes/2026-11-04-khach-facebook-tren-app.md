# Khách Facebook trên app Flutter

App có đủ tính năng tab Khách Facebook của web, trừ phần cài đặt. App gọi đúng các API sẵn có ở `src/app/api/facebook`, không đổi backend.

| Màn | Làm được |
| --- | --- |
| `KhachFacebookScreen` | 5 bộ lọc, thẻ bài (nhãn, ảnh, vị trí, lý do giữ lại), bình luận và huỷ, nhắn tin và huỷ, đã liên hệ, bỏ qua, đưa về mới, chặn, chấm bài treo, chạy / dừng agent |
| `NhomFacebookScreen` | Thêm nhiều link, bật / tắt, quét lại từ đầu, ghim hạng, xoá |
| `NhatKyFacebookScreen` | Nhật ký realtime, lọc theo loại, tạm dừng, tự cuộn, mở chi tiết |
| `NutKhachFacebook` | Nút ở Tổng quan kèm số khách mới và số agent đang chạy |

- Không làm trên app: chế độ, lịch chạy, ngưỡng phân hạng, mẫu, tự bình luận, danh sách đen, kênh báo. Sửa trên web.
- Web dùng rê chuột để xem căn cứ vị trí và nội dung bình luận. App hiện nội dung bình luận thẳng trên thẻ, bấm nhãn vị trí thì mở bảng căn cứ kèm nút tìm lại.
- `jsonHopLe` làm sạch chuỗi từ API: máy chủ cắt chuỗi bằng `.slice` có thể đứt giữa emoji, Flutter gặp chuỗi đó sẽ ném lỗi khi vẽ chữ. Dữ liệu thật của nhật ký có trường hợp này.
- Thêm `url_launcher` để mở bài viết bằng app Facebook hoặc trình duyệt.
- `mobile.yml` build thêm cho nhánh `app/**`.
