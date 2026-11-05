const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Strict allowlist: extension must map to one of its expected MIME types
const ALLOWED_EXT_MIME_MAP = {
    '.jpg': ['image/jpeg', 'image/pjpeg'],
    '.jpeg': ['image/jpeg', 'image/pjpeg'],
    '.png': ['image/png'],
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.xls': ['application/vnd.ms-excel'],
    '.csv': ['text/csv', 'application/vnd.ms-excel', 'text/plain']
};

// Explicit blocklist for dangerous executable/script extensions
const DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.php3', '.php4', '.php5',
    '.phps', '.cgi', '.pl', '.py', '.js', '.vbs', '.msi', '.scr', '.jar',
    '.html', '.htm', '.xhtml', '.svg', '.jsp', '.asp', '.aspx'
];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Prevent path traversal and sanitize fieldname
        const safeFieldname = (file.fieldname || 'file').replace(/[^a-zA-Z0-9_-]/g, '');
        const ext = path.extname(file.originalname).toLowerCase();
        
        // Use cryptographically secure random bytes for unpredictable filenames
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
        cb(null, `${safeFieldname}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Reject null bytes or path traversal in originalname
        if (file.originalname.includes('\0') || file.originalname.includes('..')) {
            return cb(new Error('Invalid filename detected.'));
        }

        const ext = path.extname(file.originalname).toLowerCase();

        // Check if extension is explicitly dangerous
        if (DANGEROUS_EXTENSIONS.includes(ext)) {
            return cb(new Error('Executable and script file uploads are strictly forbidden!'));
        }

        // Two-way validation: extension must exist in allowlist AND MIME type must match
        const allowedMimes = ALLOWED_EXT_MIME_MAP[ext];
        if (allowedMimes && allowedMimes.includes(file.mimetype)) {
            return cb(null, true);
        }

        cb(new Error('Invalid file format. Upload rejected. Permitted formats: JPG, PNG, PDF, DOC, DOCX, XLSX, XLS, CSV.'));
    }
});

upload.ALLOWED_EXT_MIME_MAP = ALLOWED_EXT_MIME_MAP;
upload.DANGEROUS_EXTENSIONS = DANGEROUS_EXTENSIONS;

module.exports = upload;
