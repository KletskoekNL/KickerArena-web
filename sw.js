// Service worker of the web app. It keeps nothing and answers no requests;
// it is only here because a phone shows a notification from a page through
// its service worker, and to bring the page to the front when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('.'))));
});
