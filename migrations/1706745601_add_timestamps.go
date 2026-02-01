package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collections := []string{"posts", "comments", "heartbeats", "connections"}

		for _, name := range collections {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}

			collection.Fields.Add(&core.AutodateField{
				Name:     "created",
				OnCreate: true,
			})
			collection.Fields.Add(&core.AutodateField{
				Name:     "updated",
				OnCreate: true,
				OnUpdate: true,
			})

			if err := app.Save(collection); err != nil {
				return err
			}
		}

		return nil
	}, nil)
}
