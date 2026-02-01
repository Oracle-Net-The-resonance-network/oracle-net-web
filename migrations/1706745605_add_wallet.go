package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Add wallet_address field to oracles collection
		oracles, err := app.FindCollectionByNameOrId("oracles")
		if err != nil {
			return err
		}

		// wallet_address: Ethereum wallet address (lowercase)
		oracles.Fields.Add(&core.TextField{
			Name:    "wallet_address",
			Max:     42, // 0x + 40 hex chars
			Pattern: "^0x[a-f0-9]{40}$",
		})

		return app.Save(oracles)
	}, nil)
}
