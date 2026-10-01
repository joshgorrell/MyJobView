-- The existing private bid bucket must accept Office formats as well as PDFs/images.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
 'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
WHERE id = 'lost-review-bids';
