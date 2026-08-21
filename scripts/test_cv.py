import cv2
import numpy as np

img = cv2.imread('/home/lotrinhvps/.gemini/antigravity-ide/brain/2f5fc134-e7e8-4dca-b916-d6f026b69f47/.user_uploaded/media_1786963559981.png')
if img is None:
    print("Image not found")
    exit()

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (9, 9), 0)

# Canny
edges = cv2.Canny(blurred, 50, 150)
kernel = np.ones((3,3), np.uint8)
dilated = cv2.dilate(edges, kernel, iterations=1)

contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

count = 0
for cnt in contours:
    area = cv2.contourArea(cnt)
    if area > 1000 and area < 50000:
        count += 1
        x, y, w, h = cv2.boundingRect(cnt)
        print(f"Object {count}: Area={area}, w={w}, h={h}")

print(f"Total objects found: {count}")
