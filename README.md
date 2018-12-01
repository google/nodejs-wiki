# Firebase Wiki
A modern wiki for the modern world.

Powered by Firestore!

## Features
* Supports Markdown to HTML
* History support
* Infoboxes and wiki links
* Discussion pages
* Special pages
* Only one individual can edit code at a time
* Authentication to restrict access to reading and/or writing

## Setup
* Create a Firebase project
    * Setup Firestore and authentication
* Run `yarn`
* Run `yarn create-firebase-config`
* Run `yarn build-wiki`
* Run `firebase init` and select **Hosting** for your project
* Deploy with `yarn serve`
    * Or develop locally with `yarn serve-local`

**Note**: If you are deploying to a system with git, you should remove `dist/` from `.gitignore` and commit the `main.js` file.

## Firestore Structure
(Collections are all caps, documents all lowercase, fields denoted by stars)

    WIKIPAGES
        home
            * title = "Home"
            * lastupdated = timestamp()
            * editing = true/false
            DELTAS
                <id>
                    * delta = "[]" (JSON stringified changes array)
                    * commit = "Some change reason"
                    * authorId = "Identifier of a user"
                    * authorName = "Display name of the user"
                    * pageTitle = "The current title of the page"

## License
See `LICENSE`.