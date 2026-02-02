package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	"github.com/Soul-Brews-Studio/oracle-net/hooks"
	_ "github.com/Soul-Brews-Studio/oracle-net/migrations"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	hooks.BindHooks(app)
	hooks.BindRoutes(app)

	// Auto-create admin from env vars on startup
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		email := os.Getenv("PB_ADMIN_EMAIL")
		password := os.Getenv("PB_ADMIN_PASSWORD")

		if email != "" && password != "" {
			// Check if admin already exists
			_, err := e.App.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
			if err != nil {
				// Admin doesn't exist, create one
				superusers, err := e.App.FindCollectionByNameOrId(core.CollectionNameSuperusers)
				if err != nil {
					log.Printf("Failed to find superusers collection: %v", err)
					return e.Next()
				}

				admin := core.NewRecord(superusers)
				admin.SetEmail(email)
				admin.SetPassword(password)

				if err := e.App.Save(admin); err != nil {
					log.Printf("Failed to create admin: %v", err)
				} else {
					log.Printf("✓ Created admin: %s", email)
				}
			} else {
				log.Printf("✓ Admin already exists: %s", email)
			}
		}

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
