const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|pdf|doc|docx|xlsx|xls|csv/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype) || 
                         file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                         file.mimetype === 'application/vnd.ms-excel' ||
                         file.mimetype === 'text/csv';

        if (extname || mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only images, PDFs, documents, and spreadsheets (XLSX, XLS, CSV) are allowed!'));
        }
    }
});

module.exports = upload;
