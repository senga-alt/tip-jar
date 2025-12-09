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

;; Update creator display name
(define-public (update-display-name (new-name (string-utf8 50)))
  (let
    (
      (caller tx-sender)
      (creator-data (unwrap! (map-get? creators caller) err-not-registered))
    )
    ;; Validations
    (asserts! (> (len new-name) u0) err-invalid-name)
    (asserts! (<= (len new-name) u50) err-invalid-name)
    
    ;; Update name
    (map-set creators caller
      (merge creator-data { display-name: new-name })
    )
    
    (ok true)
  )
)

;; Send a tip
(define-public (send-tip 
  (recipient principal) 
  (amount uint) 
  (message (optional (string-utf8 280))))
  (let
    (
      (tip-id (+ (var-get tip-counter) u1))
      (tipper tx-sender)
      (creator-data (unwrap! (map-get? creators recipient) err-not-registered))
      (current-tip-ids (default-to (list) (map-get? creator-tip-ids recipient)))
      (tipper-data (default-to 
        { total-tipped: u0, tip-count: u0, last-tip-at: u0 }
        (map-get? tipper-stats { creator: recipient, tipper: tipper })
      ))
    )
    
    ;; Validations
    (asserts! (>= amount min-tip-amount) err-invalid-amount)
    (asserts! (<= amount max-tip-amount) err-invalid-amount)
    (asserts! (not (is-eq tipper recipient)) err-unauthorized)
    
    ;; Validate message length if provided
    (match message
      msg (asserts! (<= (len msg) u280) err-message-too-long)
      true
    )

    ;; Transfer sBTC from tipper to recipient
    (try! (contract-call? sbtc-token transfer
      amount
      tipper
      recipient
      none
    ))
    
    ;; Store tip record
    (map-set tips tip-id {
      tipper: tipper,
      recipient: recipient,
      amount: amount,
      message: message,
      timestamp: stacks-block-height,
      block-height: stacks-block-height
    })
    
    ;; Update tip counter
    (var-set tip-counter tip-id)
    
    ;; Update creator stats
    (map-set creators recipient
      (merge creator-data {
        total-received: (+ (get total-received creator-data) amount),
        tip-count: (+ (get tip-count creator-data) u1)
      })
    )
    
    ;; Add tip ID to creator's list (max 1000 tips tracked)
    (map-set creator-tip-ids recipient
      (unwrap-panic (as-max-len? (append current-tip-ids tip-id) u1000))
    )
    
    ;; Update tipper stats for this creator
    (map-set tipper-stats { creator: recipient, tipper: tipper }
      {
        total-tipped: (+ (get total-tipped tipper-data) amount),
        tip-count: (+ (get tip-count tipper-data) u1),
        last-tip-at: stacks-block-height
      }
    )
    
    ;; Update platform stats
    (var-set total-tips-count (+ (var-get total-tips-count) u1))
    (var-set total-volume (+ (var-get total-volume) amount))
    
    (ok tip-id)
  )
)

;; ========================================
;; Helper Functions
;; ========================================

;; Get multiple tip details at once
(define-read-only (get-tips-batch (tip-ids (list 20 uint)))
  (map get-tip tip-ids)
)

;; Get recent tips for a creator (last N tips)
(define-read-only (get-recent-tips (creator principal) (count uint))
  (let
    (
      (tip-ids (get-creator-tip-ids creator))
      (total-tips (len tip-ids))
    )
    (if (> total-tips count)
      ;; Return last N tips
      (get-tips-batch (unwrap-panic (slice? tip-ids (- total-tips count) total-tips)))
      ;; Return all tips if less than count
      (get-tips-batch (unwrap-panic (as-max-len? tip-ids u20)))
    )
  )
)