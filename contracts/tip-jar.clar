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

;; Individual tip records
(define-map tips
  uint ;; tip-id
  {
    tipper: principal,
    recipient: principal,
    amount: uint,
    message: (optional (string-utf8 280)),
    timestamp: uint,
    block-height: uint
  }
)

;; Creator's tip history (list of tip IDs)
(define-map creator-tip-ids
  principal
  (list 1000 uint)
)

;; Leaderboard - tracks top tippers per creator
(define-map tipper-stats
  { creator: principal, tipper: principal }
  {
    total-tipped: uint,
    tip-count: uint,
    last-tip-at: uint
  }
)

;; ========================================
;; Read-Only Functions
;; ========================================

;; Check if a principal is registered as creator
(define-read-only (is-creator (user principal))
  (is-some (map-get? creators user))
)

;; Get creator info
(define-read-only (get-creator-info (creator principal))
  (map-get? creators creator)
)

;; Get specific tip details
(define-read-only (get-tip (tip-id uint))
  (map-get? tips tip-id)
)

;; Get creator's tip IDs
(define-read-only (get-creator-tip-ids (creator principal))
  (default-to (list) (map-get? creator-tip-ids creator))
)

;; Get tipper stats for a specific creator
(define-read-only (get-tipper-stats (creator principal) (tipper principal))
  (map-get? tipper-stats { creator: creator, tipper: tipper })
)

;; Get current tip counter
(define-read-only (get-tip-counter)
  (var-get tip-counter)
)

;; Get platform stats
(define-read-only (get-platform-stats)
  {
    total-tips: (var-get total-tips-count),
    total-volume: (var-get total-volume)
  }
)

;; ========================================
;; Public Functions
;; ========================================

;; Register as a creator
(define-public (register-creator (display-name (string-utf8 50)))
  (let
    (
      (caller tx-sender)
    )
    ;; Validations
    (asserts! (is-none (map-get? creators caller)) err-already-registered)
    (asserts! (> (len display-name) u0) err-invalid-name)
    (asserts! (<= (len display-name) u50) err-invalid-name)
    
    ;; Store creator info
    (map-set creators caller {
      display-name: display-name,
      registered-at: stacks-block-height,
      total-received: u0,
      tip-count: u0
    })
    
    ;; Initialize empty tip ID list
    (map-set creator-tip-ids caller (list))
    
    (ok true)
  )
)