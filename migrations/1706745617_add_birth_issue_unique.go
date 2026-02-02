package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		oracles, err := app.FindCollectionByNameOrId("oracles")
		if err != nil {
			return err
		}

		// Add unique index on birth_issue (conditional - allows empty values)
		// This prevents duplicate Oracle records with the same birth issue
		oracles.AddIndex("idx_unique_birth_issue", true, "birth_issue", "birth_issue != ''")

		return app.Save(oracles)
	}, func(app core.App) error {
		oracles, err := app.FindCollectionByNameOrId("oracles")
		if err != nil {
			return err
		}

		// Remove index on rollback
		oracles.RemoveIndex("idx_unique_birth_issue")

		return app.Save(oracles)
	})
}
