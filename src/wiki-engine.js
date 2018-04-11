/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Diffing engine
const diffcreate = require('textdiff-create');
const diffpatch = require('textdiff-patch');

// Firebase init
const firebase = require('firebase/app');
// Required for side-effects
require('firebase/auth');
require('firebase/firestore');
const env = require('../setup/firebase-env.json');
firebase.initializeApp(env.result);
// Authentication
const authProvider = new firebase.auth.GoogleAuthProvider();
const db = firebase.firestore();
db.settings({timestampsInSnapshots: true});

const config = require('../setup/config.json');
const unified = require('unified');
const markdown = require('remark-parse');
const html = require('remark-html');

// Initialize our browser history from now on
// import createHistory from 'history/createBrowserHistory'

// Sanitize user input
function escapeUserInput(unsafe) {
  return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function renderWikiData(rawMarkdownContent) {
  return new Promise((resolve, reject) => {
    // Sanitize user content
    let markdownContent = escapeUserInput(rawMarkdownContent);
    // Export from Markdown to HTML
    // TODO Move special text features to separate JS file
    /*
    * Render special text features
    *
    * Hello [[world]] => Hello <a href='?p=world'>world</a>
    * Hello [[world|World]] => Hello <a href='?p=world'>World</a>
    */
    markdownContent = markdownContent.replace(/\[\[([A-Za-z]*)]]/g,
        '<a href=\'?p=$1\'>$1</a>');

    markdownContent = markdownContent
        .replace(/\[\[([A-Za-z1-9\s-]*)\|([A-Za-z1-9\s-]*)]]/g,
            '<a href=\'?p=$1\'>$2</a>');
    /*
    * Render infoboxes in a key-value system
    * These are JSON objects wrapped in curly brackets
    * An `image` will get rendered at the top.
    * Other key-values are rendered in order.
    * These _require_ quotes for key and value.
    * Starting with # creates a new section with the value's name
    * {{
    *   "title": "Title",
    *   "image": "http://example.com/image.png",
    *   "name": "Example",
    *   "subtitle": "Subtitle",
    *   "#1": "Section 1"
    * }}
    */
    const infoboxMatches = markdownContent.match(/{{(?:.|\n)+?}}/g);
    try {
      if (infoboxMatches) {
        for (const infoboxObject of infoboxMatches) {
          // Replace HTML out
          let infobox = '<div class=\'infobox\'>';
          console.log(infoboxObject.substring(1, infoboxObject.length - 1));
          const jsonString = infoboxObject.substring(1, infoboxObject.length - 1);
          // Convert escaped characters back to original characters to do the JSON parsing
          const jsonStringUnescaped = jsonString.replace(/&quot;/g, '"');
          const jsonObject = JSON.parse(jsonStringUnescaped);
          if (jsonObject.title) {
            infobox += `<div class='title'>${escapeUserInput(jsonObject.title)}</div>`;
          }
          if (jsonObject.image) {
            // Display an image
            infobox += `<img src='${jsonObject.image}' />`;
          }
          infobox += '<table>';
          for (const key in jsonObject) {
            if (key == 'image') continue;
            if (key == 'title') continue;
            if (key.indexOf('#') == 0) {
              infobox += `<tr><td colspan="2" class='heading'>` +
                  `${escapeUserInput(jsonObject[key])}</td></tr>`;
            } else {
              infobox += `<tr><td><i>${key}</i></td><td><span>` +
                  `${escapeUserInput(jsonObject[key])}</span></td></tr>`;
            }
          }
          infobox += '</table></div>';
          markdownContent = markdownContent.replace(infoboxObject, infobox);
        }
      }
    } catch (e) {
      // If it fails, let it fail and display weird text on page.
      console.warn(e);
    }

    unified()
        .use(markdown)
        .use(html)
        .process(markdownContent, (err, html) => {
          if (err) {
            reject(err);
            return;
          }
          let htmlout = String(html);
          // Add an optional table of contents
          if (htmlout.match(/<h1>/g) &&
              htmlout.match(/<h1>/g).length >= 2) {
            console.info('Create a TOC');
            // Display table of contents
            let toc = '<div class=\'table-of-contents\'>' +
                '<strong>Contents</strong><ol>';
            console.log(htmlout);
            const headings = htmlout.match(/<h[1-5]>.+?<\/h[1-5]>/g);
            let prevType = 1;
            for (const heading of headings) {
              const headingType = parseInt(heading.substring(2, 3));
              const headingTitle = heading.substring(4, heading.length - 5);
              console.info(headingTitle, 'is h', headingType);
              if (prevType < headingType) {
                for (let i = prevType; i < headingType; i++) {
                  toc += `<ol>`;
                }
              } else if (prevType > headingType) {
                for (let i = prevType; i > headingType; i--) {
                  toc += `</ol>`;
                }
              }
              const headingId = headingTitle.indexOf(' ') > -1 ?
                headingTitle.substring(0, headingTitle.indexOf(' ')) :
                headingTitle;
              toc += `</li><li><a href='#${headingId}'>${headingTitle}</a>`;
              prevType = headingType;
              console.log(toc);
            }
            toc += '</li></ol></div>';
            // Update each heading to have a navigatable id
            // <h1>Hello world</h1> => <h1 id='Hello'>Hello world</h1>
            htmlout = htmlout.replace(/<h([1-5])>(([A-Za-z]+).*?)<\/h[1-5]>/g,
                '<h$1 id=\'$3\'>$2</h$1>');
            console.info('Added navigatable IDs');
            // Update with TOC
            console.log(htmlout);
            htmlout = htmlout.replace('<h1', `${toc}<h1`);
            console.log(htmlout);
          }
          resolve(htmlout);
        });
  });
}

function loadWikiPage(pagename) {
  /**
   * Define Editor DOM
   */
  const discussButton = document.querySelector('.actions #discuss');
  const editButton = document.querySelector('.actions #edit');
  const historyButton = document.querySelector('.actions #history');
  const contentEditor = document.querySelector('#content-editor');
  const editor = document.querySelector('#editor');
  const preview = document.querySelector('#preview');
  const save = document.querySelector('#save');
  const forceUnlock = document.querySelector('#force-unlock');
  const cancel = document.querySelector('#cancel');
  const commit = document.querySelector('#commit');
  // Define our HTML elements
  const title = document.querySelector('#title');
  const body = document.querySelector('#content');
  const contentPane = document.querySelector('#content-pane');
  const contentPaneContainer = document
      .querySelector('#content-pane-container');
  const contentPaneClose = document.querySelector('#content-pane-close');
  const lastUpdated = document.querySelector('#last-updated');

  let pageExists = false;
  let pageDeltas = [];

  pagename = pagename.toLowerCase(); // Case insensitive
  console.info(`Navigating to page ${pagename}`);

  // Figure out if we're on a "Special:" page
  if (pagename === 'special:documents') {
    title.textContent = 'All pages on this wiki';
    discussButton.style.display = 'none'; // Can't edit this page
    editButton.style.display = 'none'; // Can't edit this page
    historyButton.style.display = 'none'; // Can't edit this page
    body.innerHTML = `<ul id='list-of-pages'></ul>`;
    const listOfPages = document.querySelector('#list-of-pages');
    db.collection('wikipages').onSnapshot((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        const docData = doc.data();
        listOfPages.innerHTML += `<li><a href='?p=${doc.id}'>` +
            `${escapeUserInput(docData.title)}</a></li>`;
      });
    });
    lastUpdated.textContent = '(autogenerated page)';
    contentEditor.style.display = 'none';
    return;
  } else if (pagename === 'special:login') {
    title.textContent = 'Please login';
    discussButton.style.display = 'none'; // Can't edit this page
    editButton.style.display = 'none'; // Can't edit this page
    historyButton.style.display = 'none'; // Can't edit this page
    body.textContent = '';
    lastUpdated.textContent = '(autogenerated page)';
    contentEditor.style.display = 'none';
    return;
  } else if (pagename === 'user:me') {
    const user = firebase.auth().currentUser;
    navigateToPage(`?p=user:${user.uid}`);
    return;
  }

  // Pull data from Firestore
  // TODO Resolve pagename -- handle redirects
  // Show metadata
  db.collection('wikipages').doc(pagename).onSnapshot((doc) => {
    const metadata = doc.data();
    console.log(doc);
    console.log('Current page metadata: ', metadata);

    if (pagename.indexOf('discuss:') == 0) {
      // Don't have a discuss:discuss:<page>
      // Link to the actual article
      discussButton.textContent = 'Article';
      discussButton.href = `?p=${doc.id.substring(8)}`;
    } else {
      discussButton.href = `?p=Discuss:${doc.id}`;
    }

    if (metadata) {
      // Lock editor if someone else is editing it simultaneously
      if (!doc._document.hasLocalMutations && metadata.editing) {
        editor.contentEditable = false;
        save.style.display = 'none';
        forceUnlock.style.display = 'block';
      } else {
        editor.contentEditable = true;
        save.style.display = 'block';
        forceUnlock.style.display = 'none';
      }
      // Display page metacontent
      title.textContent = metadata.title;
      lastUpdated.textContent = new Date(metadata.lastupdated).toUTCString();
      window.title = `${escapeUserInput(metadata.title)} | ` +
        `${escapeUserInput(config.wikiname)}`;
      pageExists = true;

      // Build our content from changes
      let markdownContent = '';
      pageDeltas = [];
      db.collection('wikipages')
          .doc(pagename)
          .collection('deltas')
          .onSnapshot((snapshot) => {
            snapshot.docChanges.forEach((change) => {
              const data = change.doc.data();
              console.log('Retrieved delta', data);
              pageDeltas.push(change.doc);
              markdownContent = diffpatch(markdownContent,
                  JSON.parse(data.delta));
            });
            console.info(markdownContent);
            renderWikiData(markdownContent)
                .then((html) => {
                  body.innerHTML = html;
                  editor.innerHTML = escapeUserInput(markdownContent);
                  preview.innerHTML = html;
                });
          });
    } else {
      console.warn('This page does not exist');
      // Page creator view
      title.textContent = pagename;
      body.textContent = 'Click the EDIT icon to create this page.';
    }
  });

  /**
   * Content pane - History
   */
  historyButton.onclick = () => {
    let out = '<h2>History of changes</h2>';
    for (const change of pageDeltas) {
      console.log(change);
      const changeUtcString = new Date(parseInt(change.id)).toUTCString();
      // Santizies user-entered commit message
      out += `<div class='card'>` +
          `<h1>${escapeUserInput(change.data().commit)}</h1>` +
          `<footer>Changed at ${changeUtcString}</footer>` +
          `</div>`;
    }
    contentPane.innerHTML = out;
    contentPaneContainer.style.display = 'inline-block';
  };
  contentPaneClose.onclick = () => {
    contentPaneContainer.style.display = 'none';
  };

  /**
   * Enable editor
   */
  contentEditor.style.display = 'none';

  editButton.onclick = () => {
    if (!pageExists) {
      // Create the page.
      db.collection('wikipages').doc(pagename).set({
        title: title.innerText,
        lastupdated: new Date().getTime(),
      }).then((docRef) => {
        console.info('Created page');
      });
    }
    // Lock this page from others editing
    db.collection('wikipages').doc(pagename).update({
      editing: true,
    });
    const originalMarkdown = editor.innerText;
    contentEditor.style.display = 'block';
    body.style.display = 'none';
    title.contentEditable = true;
    title.classList.add('editable');

    save.onclick = () => {
      console.log(originalMarkdown, editor.innerText);
      const patch = diffcreate(originalMarkdown, editor.innerText);
      console.log(JSON.stringify(patch));
      // Save to our wiki page with the current timestamp
      const timestamp = new Date().getTime();
      db.collection('wikipages')
          .doc(pagename)
          .collection('deltas')
          .doc(`${timestamp}`)
          .set({
            delta: JSON.stringify(patch),
            commit: commit.innerText,
          }).then((docRef) => {
            console.log(`Document updated @${timestamp}`);
          });
      // Update our wiki metadata
      db.collection('wikipages')
          .doc(pagename)
          .update({
            title: title.innerText,
            lastupdated: timestamp,
          }).then((docRef) => {
            console.info('Updated METADATA');
          });
      // Return to viewer
      cancel.click();
    };
    forceUnlock.onclick = () => {
      db.collection('wikipages')
          .doc(pagename)
          .update({
            editing: false,
          }).then((docRef) => {
            return db.collection('wikipages')
                .doc(pagename)
                .update({
                  editing: true, // Re-lock it
                });
          }).then((docRef) => {
            console.info('Unlocked page for editing');
          });
    };
    cancel.onclick = () => {
      contentEditor.style.display = 'none';
      body.style.display = 'inline-block';
      title.classList.remove('editable');
      title.contentEditable = false;
      db.collection('wikipages').doc(pagename).update({
        editing: false,
      });
    };
    editor.onkeyup = () => {
      // Render live preview
      renderWikiData(editor.innerText)
          .then((html) => {
            preview.innerHTML = html;
          });
    };
  };
}

const navigateToPage = (page) => {
  if (window.location.search != page) {
    window.location = page;
  }
};

window.addEventListener('load', () => {
  // Initialize user-defined configuration
  window.title = config.wikiname;
  // Check our current location
  const getQueryParam = require('get-query-param');
  const page = getQueryParam('p', window.location.href) || 'home';
  // Setup our login page
  document.querySelector('#login-notauth').onclick = () => {
    firebase.auth().signInWithPopup(authProvider).then(() => {
      navigateToPage('?p=Home');
    });
  };
  document.querySelector('#login-exit').onclick = () => {
    firebase.auth().signOut();
  };
  firebase.auth().onAuthStateChanged((user) => {
    loadWikiPage(page);
    if (user) {
      // User is signed in.
      const displayName = user.displayName;
      const email = user.email;
      document.querySelector('#my-name').textContent = displayName;
      if (config['valid-emails'] &&
          config['valid-emails'].indexOf(email) == -1) {
        navigateToPage('?p=Special:Login');
      }
      document.querySelector('#login-notauth').style.display = 'none';
    } else {
      if (config['read-pages'] && config['read-pages'] === 'AUTH_REQUIRED') {
        navigateToPage('?p=Special:Login');
      }
      document.querySelector('#login-welcome').style.display = 'none';
    }
  });
});
