rules_version = '2';
service cloud.firestore {
match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function userEmail() {
      return request.auth.token.email;
    }

    function isParent(childId) {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/children/$(childId)) &&
        get(/databases/$(database)/documents/children/$(childId)).data.parentIds
          .hasAny([request.auth.uid]);
    }

    // Users
    match /users/{uid} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
    }

    // User prefs
    match /user_preferences/{uid} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
    }

    // Children
    match /children/{childId} {
      allow read: if isParent(childId);
      allow create: if isSignedIn() &&
        request.resource.data.parentIds.hasAny([request.auth.uid]);
      allow update, delete: if isParent(childId);
    }

    // Events (NEW)
    match /events/{eventId} {
      allow read, update, delete: if isParent(resource.data.childId);
      allow create: if isParent(request.resource.data.childId);
    }

    // Legacy events (OLD)
    match /tetees/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }
    match /pompages/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }
    match /mictions/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }
    match /selles/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }
    match /vaccins/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }
    match /vitamines/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }
    match /croissances/{docId} {
      allow read, write: if isParent(resource.data.childId) || isParent(request.resource.data.childId);
    }

    // Share invitations
    match /shareInvitations/{inviteId} {
      allow read: if isSignedIn() &&
        (userEmail() == resource.data.invitedEmail ||
         userEmail() == resource.data.inviterEmail);
      allow create: if isSignedIn();
      allow update: if isSignedIn() && userEmail() == resource.data.invitedEmail;
    }

    // Share codes
    match /shareCodes/{code} {
      allow read, write: if isSignedIn();
    }

    // Baby attachment (maternité / simId flow)
    match /babies/{simId} {
      allow read: if isSignedIn();
      allow write: if false; // réservé admin/back-office
    }
    match /babyAttachmentRequests/{requestId} {
      allow create: if isSignedIn();
      allow read, update: if isSignedIn() && userEmail() == resource.data.parentEmail;
    }

    // Pro validation requests (si utilisé)
    match /professional-validation-requests/{requestId} {
      allow create: if isSignedIn();
      allow read: if isSignedIn() && request.auth.uid == resource.data.userId;
      allow update, delete: if false; // à ouvrir pour admin si besoin
    }

    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }

}
}
