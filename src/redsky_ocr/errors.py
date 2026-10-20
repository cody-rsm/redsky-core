class ProcessingError(Exception):
    # Messages end up in the API and the database, so they describe the
    # problem without quoting document content.
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


EMPTY_FILE = "EMPTY_FILE"
FILE_TOO_LARGE = "FILE_TOO_LARGE"
UNSUPPORTED_TYPE = "UNSUPPORTED_TYPE"
MACRO_ENABLED = "MACRO_ENABLED"
ARCHIVE_BOMB = "ARCHIVE_BOMB"
ENCRYPTED_FILE = "ENCRYPTED_FILE"
CORRUPT_FILE = "CORRUPT_FILE"
TOO_MANY_PAGES = "TOO_MANY_PAGES"
IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"
MALWARE_DETECTED = "MALWARE_DETECTED"
MALWARE_SCAN_FAILED = "MALWARE_SCAN_FAILED"
ENGINE_UNAVAILABLE = "ENGINE_UNAVAILABLE"
ENGINE_FAILED = "ENGINE_FAILED"
PROCESSING_TIMEOUT = "PROCESSING_TIMEOUT"
WORKER_CRASHED = "WORKER_CRASHED"
SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
SOURCE_DELETED = "SOURCE_DELETED"
NO_AI_DOCUMENT = "NO_AI_DOCUMENT"
