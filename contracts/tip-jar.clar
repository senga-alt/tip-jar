;; sBTC Tip Jar Contract
;; Allows creators to receive Bitcoin tips via sBTC

;; ========================================
;; Constants
;; ========================================

;; sBTC Token Reference (Devnet/Testnet)
(define-constant sbtc-token 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)

;; Contract owner
(define-constant contract-owner tx-sender)

;; Error codes
(define-constant err-unauthorized (err u100))
(define-constant err-already-registered (err u101))
(define-constant err-not-registered (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-transfer-failed (err u104))
(define-constant err-invalid-name (err u105))
(define-constant err-message-too-long (err u106))

;; Minimum and maximum tip amounts (in satoshis)
(define-constant min-tip-amount u10000) ;; 0.0001 sBTC
(define-constant max-tip-amount u1000000000) ;; 10 sBTC

;; ========================================
;; Data Variables
;; ========================================

;; Counter for tip IDs
(define-data-var tip-counter uint u0)

;; Total platform stats
(define-data-var total-tips-count uint u0)
(define-data-var total-volume uint u0)

;; ========================================
;; Data Maps
;; ========================================

;; Creator registration info
(define-map creators
  principal
  {
    display-name: (string-utf8 50),
    registered-at: uint,
    total-received: uint,
    tip-count: uint
  }
)