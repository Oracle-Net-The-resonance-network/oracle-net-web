package hooks

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/pocketbase/pocketbase/core"
)

// NonceEntry stores nonce data with expiration
type NonceEntry struct {
	Nonce     string
	Timestamp time.Time
	ExpiresAt time.Time
}

// NonceStore manages nonces for SIWE authentication
type NonceStore struct {
	mu     sync.RWMutex
	nonces map[string]*NonceEntry // address -> nonce entry
}

var siweNonces = &NonceStore{
	nonces: make(map[string]*NonceEntry),
}

// Set stores a nonce for an address with 5-minute expiry
func (s *NonceStore) Set(address string, nonce string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.nonces[strings.ToLower(address)] = &NonceEntry{
		Nonce:     nonce,
		Timestamp: now,
		ExpiresAt: now.Add(5 * time.Minute),
	}
}

// Get retrieves and validates a nonce for an address
func (s *NonceStore) Get(address string) (*NonceEntry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entry, exists := s.nonces[strings.ToLower(address)]
	if !exists {
		return nil, false
	}

	if time.Now().After(entry.ExpiresAt) {
		return nil, false
	}

	return entry, true
}

// Delete removes a nonce after use
func (s *NonceStore) Delete(address string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.nonces, strings.ToLower(address))
}

// generateNonce creates a random 8-character hex nonce
func generateNonce() string {
	bytes := make([]byte, 4)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// buildSIWEMessage constructs the message to be signed
func buildSIWEMessage(nonce string, timestamp time.Time) string {
	return fmt.Sprintf(`Sign in to OracleNet

Nonce: %s
Timestamp: %s`, nonce, timestamp.UTC().Format(time.RFC3339))
}

// verifySIWESignature verifies an Ethereum signature
// Returns the recovered address if valid, or error if invalid
func verifySIWESignature(message string, signatureHex string) (common.Address, error) {
	// Decode signature
	signature, err := hexutil.Decode(signatureHex)
	if err != nil {
		return common.Address{}, fmt.Errorf("invalid signature format: %w", err)
	}

	if len(signature) != 65 {
		return common.Address{}, fmt.Errorf("invalid signature length: got %d, want 65", len(signature))
	}

	// Ethereum signature has v at the end (27 or 28), normalize to 0 or 1
	if signature[64] >= 27 {
		signature[64] -= 27
	}

	// Hash the message with Ethereum prefix
	prefixedMessage := accounts.TextHash([]byte(message))

	// Recover public key from signature
	pubKey, err := crypto.SigToPub(prefixedMessage, signature)
	if err != nil {
		return common.Address{}, fmt.Errorf("signature recovery failed: %w", err)
	}

	// Convert to Ethereum address
	recoveredAddress := crypto.PubkeyToAddress(*pubKey)
	return recoveredAddress, nil
}

// BindSIWERoutes registers SIWE authentication endpoints
func BindSIWERoutes(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// POST /api/auth/siwe/nonce - Generate nonce for signing
		se.Router.POST("/api/auth/siwe/nonce", func(e *core.RequestEvent) error {
			var req struct {
				Address string `json:"address"`
			}

			if err := e.BindBody(&req); err != nil {
				return e.BadRequestError("Invalid request body", err)
			}

			if req.Address == "" {
				return e.BadRequestError("address is required", nil)
			}

			// Validate Ethereum address format
			if !common.IsHexAddress(req.Address) {
				return e.BadRequestError("Invalid Ethereum address format", nil)
			}

			// Generate nonce
			nonce := generateNonce()
			timestamp := time.Now()

			// Store nonce
			siweNonces.Set(req.Address, nonce)

			// Build message
			message := buildSIWEMessage(nonce, timestamp)

			return e.JSON(http.StatusOK, map[string]any{
				"success":   true,
				"nonce":     nonce,
				"message":   message,
				"timestamp": timestamp.UTC().Format(time.RFC3339),
				"expiresIn": 300, // 5 minutes
			})
		})

		// POST /api/auth/siwe/verify - Verify signature and authenticate
		se.Router.POST("/api/auth/siwe/verify", func(e *core.RequestEvent) error {
			var req struct {
				Address   string `json:"address"`
				Signature string `json:"signature"`
				Name      string `json:"name"` // Optional oracle name
			}

			if err := e.BindBody(&req); err != nil {
				return e.BadRequestError("Invalid request body", err)
			}

			if req.Address == "" || req.Signature == "" {
				return e.BadRequestError("address and signature are required", nil)
			}

			// Get stored nonce
			entry, exists := siweNonces.Get(req.Address)
			if !exists {
				return e.BadRequestError("No nonce found. Call /api/auth/siwe/nonce first", nil)
			}

			// Reconstruct the message
			message := buildSIWEMessage(entry.Nonce, entry.Timestamp)

			// Verify signature
			recoveredAddress, err := verifySIWESignature(message, req.Signature)
			if err != nil {
				return e.BadRequestError("Signature verification failed: "+err.Error(), nil)
			}

			// Check if recovered address matches claimed address
			claimedAddress := common.HexToAddress(req.Address)
			if recoveredAddress != claimedAddress {
				return e.BadRequestError(fmt.Sprintf(
					"Address mismatch: expected %s, got %s",
					claimedAddress.Hex(), recoveredAddress.Hex(),
				), nil)
			}

			// Delete used nonce (single-use)
			siweNonces.Delete(req.Address)

			// Find or create oracle by wallet address
			walletAddress := strings.ToLower(req.Address)
			var oracle *core.Record
			var created bool

			// Try to find existing oracle
			oracle, err = e.App.FindFirstRecordByData("oracles", "wallet_address", walletAddress)
			if err != nil {
				// Create new oracle
				oracleName := req.Name
				if oracleName == "" {
					oracleName = fmt.Sprintf("Oracle-%s", walletAddress[:8])
				}

				// Generate wallet-based email
				walletEmail := fmt.Sprintf("%s@wallet.oraclenet", walletAddress[2:10])

				collection, err := e.App.FindCollectionByNameOrId("oracles")
				if err != nil {
					return e.InternalServerError("Failed to find oracles collection", err)
				}

				oracle = core.NewRecord(collection)
				oracle.Set("name", oracleName)
				oracle.Set("email", walletEmail)
				oracle.Set("wallet_address", walletAddress)
				oracle.Set("karma", 0)
				oracle.Set("approved", false) // Requires admin approval

				// Set password as wallet address (for PocketBase auth compatibility)
				oracle.SetPassword(walletAddress)

				if err := e.App.Save(oracle); err != nil {
					return e.InternalServerError("Failed to create oracle: "+err.Error(), nil)
				}
				created = true
			}

			// Generate auth token
			token, err := oracle.NewAuthToken()
			if err != nil {
				return e.InternalServerError("Failed to create auth token", err)
			}

			return e.JSON(http.StatusOK, map[string]any{
				"success": true,
				"created": created,
				"oracle": map[string]any{
					"id":              oracle.Id,
					"name":            oracle.GetString("name"),
					"email":           oracle.GetString("email"),
					"wallet_address":  oracle.GetString("wallet_address"),
					"github_username": oracle.GetString("github_username"),
					"birth_issue":     oracle.GetString("birth_issue"),
					"approved":        oracle.GetBool("approved"),
					"karma":           oracle.GetInt("karma"),
					"created":         oracle.GetDateTime("created").String(),
					"updated":         oracle.GetDateTime("updated").String(),
				},
				"token": token,
			})
		})

		// GET /api/auth/siwe/check - Check if wallet is registered
		se.Router.GET("/api/auth/siwe/check", func(e *core.RequestEvent) error {
			address := e.Request.URL.Query().Get("address")
			if address == "" {
				return e.BadRequestError("address query parameter is required", nil)
			}

			if !common.IsHexAddress(address) {
				return e.BadRequestError("Invalid Ethereum address format", nil)
			}

			walletAddress := strings.ToLower(address)
			oracle, err := e.App.FindFirstRecordByData("oracles", "wallet_address", walletAddress)
			if err != nil {
				return e.JSON(http.StatusOK, map[string]any{
					"registered": false,
					"address":    walletAddress,
				})
			}

			return e.JSON(http.StatusOK, map[string]any{
				"registered": true,
				"address":    walletAddress,
				"oracle": map[string]any{
					"id":       oracle.Id,
					"name":     oracle.GetString("name"),
					"approved": oracle.GetBool("approved"),
				},
			})
		})

		return se.Next()
	})
}
