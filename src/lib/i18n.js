import { useSyncExternalStore } from "react";
import { enGB, he } from "date-fns/locale";

const STORAGE_KEY = "project-travel:lang";

export const LANGUAGES = [
  { code: "en", label: "English", native: "English", dir: "ltr" },
  { code: "he", label: "Hebrew", native: "עברית", dir: "rtl" },
];

const DATE_LOCALES = { en: enGB, he };
const INTL_LOCALES = { en: "en-GB", he: "he-IL" };

const STRINGS = {
  en: {
    // shell
    "app.name": "TravelPal",
    "app.tagline": "Explore Together",
    "nav.main": "Main",
    "nav.sections": "Trip sections",
    "nav.view": "View",
    "nav.plan": "Plan",
    "nav.details": "Details",
    "nav.budget": "Budget",
    "nav.discover": "Discover",
    "nav.share": "Share trip",
    "nav.settings": "Settings",
    "tab.destinations": "Destinations",
    "tab.details": "Details",
    "tab.dayByDay": "Daily planner",
    "tab.budget": "Budget",

    // trips (multi-trip switcher)
    "trips.switch": "Switch trip",
    "trips.label": "Your trips",
    "trips.new": "New trip",
    "trips.newTitle": "New trip",
    "trips.delete": "Delete {name}",
    "trips.confirmDelete":
      "Delete “{name}” and everything in it? This can’t be undone.",

    // auth (magic-link sign in / sign up)
    "auth.tagline":
      "Plan trips that live in your browser — and in your account.",
    "auth.emailLabel": "Email address",
    "auth.emailPlaceholder": "you@example.com",
    "auth.send": "Send magic link",
    "auth.sending": "Sending…",
    "auth.sentTitle": "Check your inbox",
    "auth.sentBody":
      "We emailed a sign-in link to {email}. Open it on this device to continue.",
    "auth.differentEmail": "Use a different email",
    "auth.resend": "Resend link",
    "auth.resending": "Resending…",
    "auth.resent": "Link sent",
    "auth.localOnly": "Continue without an account",
    "auth.localOnlyHint": "Your trips stay on this device and won’t sync.",
    "auth.invalidEmail": "Enter a valid email address.",
    "auth.error": "Couldn’t send the link. Please try again.",
    "auth.passwordToggle": "Sign in with a password instead",
    "auth.passwordLabel": "Password",
    "auth.passwordSignIn": "Sign in",
    "auth.passwordSigningIn": "Signing in…",
    "auth.passwordError": "Incorrect email or password.",
    "auth.backToMagicLink": "Back to email link",

    // trip picker (the landing screen after signing in)
    "picker.title": "Your trips",
    "picker.subtitle": "Pick a trip to open, or start a new one.",
    "picker.new": "New trip",
    "picker.open": "Open {name}",
    "picker.nights": "{count} nights",
    "picker.signedInAs": "Signed in as {email}",
    "picker.signOut": "Sign out",
    "picker.localMode": "Using without an account",
    "picker.signInToSync": "Sign in to sync",
    "picker.sharedBadge": "Shared with you",
    "picker.invitationsTitle": "Trip invitations",
    "picker.invitationsSubtitle":
      "Someone shared a trip with you — accept to start editing, or remove it if this wasn’t meant for you.",
    "picker.accept": "Accept",
    "picker.decline": "Remove",
    "picker.acceptInvitation": "Accept the invitation to {name}",
    "picker.declineInvitation": "Decline the invitation to {name}",
    "picker.leaveTrip": "Remove {name} from your trips",
    "picker.confirmLeave":
      "Remove “{name}” from your trips? You keep nothing local — the owner keeps the trip, and can invite you again if this was a mistake.",
    "header.allTrips": "All trips",
    "header.menu": "Menu",
    "header.goTo": "Go to",

    // language + theme
    "lang.label": "Language",
    "lang.change": "Change language",
    "theme.label": "Theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.system": "System",
    "theme.switchTo": "Switch theme (currently {mode})",

    // header
    "header.editTrip": "Edit trip name and dates",
    "header.title": "Trip title",
    "header.startDate": "Trip start date",
    "header.endDate": "Trip end date",
    "header.done": "Done",
    "header.costIn": "Cost in",
    "header.currency": "Display currency",
    "header.nights": "Nights",
    "header.planned": "planned",
    "header.nightsPlanned": "{value} of {total} nights planned",
    "header.exportPdf": "Export PDF",
    "header.overplanned":
      "You’ve planned {planned} nights but the trip is only {total} nights long. Extend the end date or trim a stop.",

    // offline downloads (cloud mode)
    "offline.download": "Download for offline",
    "offline.downloaded": "Available offline",
    "offline.banner":
      "You’re offline — showing the last available copy. Changes won’t be saved until you’re back online.",

    // plan
    "plan.destination": "Destination",
    "plan.nights": "Nights",
    "plan.accommodationCol": "Accommodation",
    "plan.order": "Order",
    "plan.night": "night",
    "plan.nightsPlural": "nights",
    "plan.addPlaceholder": "Add new destination…",
    "plan.searchLabel": "Search for a destination to add",
    "plan.emptyTitle": "No stops yet",
    "plan.emptyBody":
      "Search below to drop your first destination on the map and start shaping the route.",
    "plan.autoDates":
      "Dates update automatically as you add nights or reorder stops.",
    "plan.nameLabel": "Destination {n} name",
    "plan.addNight": "Add a night in {name}",
    "plan.removeNight": "Remove a night in {name}",
    "plan.dragHint": "Drag to reorder",
    "plan.openDayHint": "Double-click to open this stop in the Daily planner",
    "plan.moveEarlier": "Move {name} earlier",
    "plan.moveLater": "Move {name} later",
    "plan.remove": "Remove {name}",
    "plan.addOrigin": "Add trip origin",
    "plan.originPlaceholder": "Where the trip starts (e.g. home)…",
    "plan.originSearchLabel": "Search for the trip's starting point",
    "plan.originNameLabel": "Trip origin name",
    "plan.removeOrigin": "Remove trip origin",
    "plan.cancelAddOrigin": "Cancel adding a trip origin",
    "plan.originShowOnMap": "Show on map",
    "plan.originNotPlaced":
      "Pick a real place from search to show it on the map",
    "plan.addLastStop": "Add a last stop",
    "plan.lastStopPlaceholder": "Where the trip ends (e.g. home)…",
    "plan.lastStopSearchLabel": "Search for the trip's last stop",
    "plan.lastStopNameLabel": "Last stop name",
    "plan.removeLastStop": "Remove last stop",
    "plan.cancelAddLastStop": "Cancel adding a last stop",
    "plan.sameAsOrigin": "Same as origin",
    "plan.useOriginAsLastStop": "Use trip origin ({name})",

    // sleeping
    // Matches the Accommodation column; the field inside is just its name, so
    // the word doesn't appear at two nesting levels meaning different things.
    "sleeping.title": "Accommodation",
    "sleeping.accommodation": "Name",
    "sleeping.placeholder": "Hotel, hostel or apartment",
    "sleeping.perNight": "Cost per night",
    "sleeping.docsHint": "Booking confirmations live under the Details tab.",

    // transport
    "transport.mode": "Mode",
    "transport.duration": "Duration (min)",
    "transport.distance": "Distance (km)",
    "transport.cost": "Cost",
    "transport.add": "Add transport",
    "transport.addDetails": "Add times and costs",
    "transport.addSegment": "Add another transport",
    "transport.removeSegment": "Remove transport {n}",
    "transport.dragHint": "Drag to reorder",
    "transport.removeField": "Remove {field}",
    "transport.durationShort": "Duration",
    "transport.distanceShort": "Distance",
    "transport.change": "1 change",
    "transport.changes": "{n} changes",
    "transport.originStation": "Origin station",
    "transport.destinationStation": "Destination station",
    "transport.originPlaceholder": "Station, airport or stop…",
    "transport.destinationPlaceholder": "Station, airport or stop…",
    "transport.useStraight": "Use straight-line distance ({km} km)",
    "transport.to": "{mode} to {name}",
    "transport.docs": "Documents for transport {n}",
    "transport.docLabel": "Transport document",
    "transport.docHint": "Drop tickets or boarding passes here, or",
    "mode.plane": "Flight",
    "mode.train": "Train",
    "mode.bus": "Bus",
    "mode.car": "Car",
    "mode.ferry": "Ferry",
    "mode.walk": "Walk",

    // details
    "details.destinations": "Destinations",
    "details.empty":
      "Add a destination first — its notes and documents will live here.",
    "details.stop": "Stop {n}",
    "details.notes": "Notes",
    "details.notesPlaceholder":
      "Reservation references, who to meet, what to pack…",
    "details.travelDocs": "Travel documents",
    "details.travelHint": "Tickets, boarding passes, visas, insurance —",
    "details.sleepingDocs": "Sleeping documents",
    "details.sleepingHint":
      "Hotel confirmations, check-in details, addresses —",
    "details.allDocuments": "All documents",
    "details.allDocumentsEmpty": "No documents anywhere in this stop yet.",
    "details.tagAccommodation": "Night {n} · Accommodation",
    "details.tagReservation": "Night {n} · {name}",
    "details.tagTransport": "Transport · {mode}",

    // documents
    "docs.title": "Documents",
    "docs.file": "file",
    "docs.files": "files",
    "docs.none": "No",
    "docs.browse": "browse",
    "docs.dropHint": "Drop files here, or",
    "docs.privacy": "Stored privately in this browser · max {size} per file",
    "docs.tooBig": '"{name}" is {size} — the limit is {max}.',
    "docs.storeFailed":
      'Could not store "{name}". Your browser storage may be full.',
    "docs.syncFailed":
      '"{name}" is saved on this device, but couldn\'t sync to the cloud.',
    "docs.preview": "Preview {name}",
    "docs.download": "Download {name}",
    "docs.delete": "Delete {name}",
    "docs.closePreview": "Close preview",
    "docs.loading": "Loading…",
    "docs.localOnlyNote": "Only available on this device.",
    "docs.signInLink": "Sign in to sync across devices",

    // day by day
    "day.empty":
      "Nothing planned yet — add a destination in the Destinations tab.",
    "day.number": "Day {n}",
    "day.done": "{done}/{total} done",
    "day.toggle": "{action} plans for day {n}",
    "day.show": "Show",
    "day.hide": "Hide",
    "day.to": "To {name}",
    "attractions.title": "Attractions",
    "attractions.placeholder": "Temple, museum, viewpoint…",
    "attractions.add": "Add attraction",
    "attractions.addBlank": "Add blank attraction",
    "attractions.cost": "Attraction cost",
    "attractions.time": "Attraction time",
    "attractions.remove": "Remove {name}",
    "attractions.fallback": "attraction",
    "attractions.dragHint": "Drag to reorder",
    "attractions.searchPlaceholder": "Search attractions and famous places…",
    "attractions.searchLabel": "Search for an attraction to add",
    "attractions.searchError":
      "Search is unavailable right now — try again shortly.",
    "attractions.addRoute": "Add route",
    "attractions.useEstimate": "Use estimate ({km} km · {time})",
    "dayStay.title": "Accommodation",
    "dayStay.add": "Add for this night",
    "dayStay.remove": "Remove this night’s accommodation",
    "dayStay.badge": "This night",
    "dayStay.inherited": "Using {name} from this destination.",
    "dayStay.inheritedNone":
      "No accommodation set for this destination — add one just for this night.",
    "dayStay.name": "Accommodation",
    "dayStay.cost": "Cost",
    "dayStay.address": "Address",
    "dayStay.addressPlaceholder": "Street, area or check-in point…",
    "dayStay.docs": "Booking documents",
    "dayStay.docsHint": "Drop the confirmation here, or",

    "biz.badge": "Business",
    "biz.loading": "Searching businesses…",
    "biz.error": "Business search is unavailable right now.",
    "source.google": "Google",
    "source.nominatim": "Nominatim",
    "source.bizdata": "BizData",
    "biz.museum": "Museums",
    "biz.gallery": "Galleries",
    "biz.theatre": "Theatres",
    "biz.restaurant": "Restaurants",
    "biz.cafe": "Cafés",
    "biz.bar": "Bars",
    "biz.hotel": "Hotels",
    "biz.hostel": "Hostels",
    "biz.supermarket": "Supermarkets",
    "biz.pharmacy": "Pharmacies",
    "unit.km": "km",
    "reserved.title": "Reserved",
    "reserved.placeholder": "Restaurant, tour, transfer…",
    "reserved.add": "Add reservation",
    "reserved.time": "Reservation time",
    "reserved.cost": "Reservation cost",
    "reserved.remove": "Remove {name}",
    "reserved.fallback": "reservation",
    "reserved.docs": "Documents for {name}",
    "reserved.docLabel": "Reservation document",
    "reserved.docHint": "Drop the confirmation here, or",
    "reserved.markDone": "Mark {name} as completed",

    // budget
    "budget.total": "Trip total",
    "budget.perNight": "per night",
    "budget.sleeping": "Sleeping",
    "budget.transport": "Transport",
    "budget.attractions": "Attractions",
    "budget.reserved": "Reserved",
    "budget.shareOfTotal": "{n}% of total",
    "budget.byDestination": "By destination",
    "budget.empty": "Add destinations to see how the budget splits up.",
    "budget.perNightRate": "{amount}/night",
    "budget.origin": "Trip origin",
    "budget.originTransport": "Transport to the first stop",
    "budget.lastStop": "Last stop",
    "budget.lastStopNote": "Counted on the stop before it",
    "budget.note":
      "Sleeping costs multiply the nightly rate by the nights at each stop, except on nights with their own accommodation, which replace it. Transport is counted on the leg leaving each destination. Attractions and reservations are totalled from the daily planner.",

    // map
    "map.label": "Map",
    "map.style": "Map style",
    "map.streets": "Streets",
    "map.minimal": "Minimal",
    "map.terrain": "Terrain",
    "map.satellite": "Satellite",
    "map.google": "Google Maps",
    "map.empty": "Add a destination to see it here",
    "map.dayRoute": "Route in {name}",
    "map.dayEmpty": "Search for attractions to build a route here",
    "map.openDetails": "Click to open details",
    "map.close": "Close map",
    "map.resize": "Resize map panel",
    "map.resizeHint": "Drag to resize · double-click to reset",

    // misc
    "misc.comingNext": "Coming next",
    "discover.body":
      "Browse recommended stops and add them straight to your route.",

    // PDF export
    "pdf.untitledTrip": "Trip",
    "pdf.generatedBy": "Generated {date} by {username}",
    "pdf.localDevice": "Local device",
    "pdf.country": "Country",
    "pdf.from": "From",
    "pdf.to": "To",
    "pdf.cost": "Cost",
    "pdf.onwardTransport": "Onward transport",
    "pdf.date": "Date",
    "pdf.stop": "Stop",
    "pdf.plan": "Plan",
    "pdf.noPlans": "No plans",
    "pdf.attraction": "Attraction",
    "pdf.reservation": "Reservation",
    "pdf.category": "Category",
    "pdf.map": "Route map",
    "pdf.footer": "{app} — Trip Summary",

    // sharing
    "share.subtitle": "Invite someone to edit, or share a view-only link.",
    "share.inviteLabel": "Invite someone to edit",
    "share.emailPlaceholder": "their@email.com",
    "share.invite": "Invite",
    "share.inviting": "Inviting…",
    "share.invited":
      "Invited — they’ll get edit access once they accept the invitation.",
    "share.invitePending":
      "Invite saved — they’ll get access as soon as they sign up with that email.",
    "share.invitePendingNoEmail":
      "Invite saved, but we couldn’t email them — let them know yourself.",
    "share.inviteError": "Couldn’t send that invite. Please try again.",
    "share.collaborators": "People who can edit",
    "share.noCollaborators": "No one else can edit this trip yet.",
    "share.awaitingAccept": "awaiting acceptance",
    "share.pendingInvites": "Waiting to sign up",
    "share.removeCollaborator": "Remove {email}",
    "share.cancelInvite": "Cancel invite to {email}",
    "share.linkTitle": "View-only link",
    "share.linkHint":
      "Anyone with a link can view the trip — they can’t edit it.",
    "share.labelPlaceholder": "Optional note (e.g. who it’s for)",
    "share.createLink": "Create link",
    "share.creatingLink": "Creating…",
    "share.copyLink": "Copy link",
    "share.linkCopied": "Copied!",
    "share.revokeLink": "Revoke",
    "share.confirmRevoke":
      "Revoke this link? Anyone using it will lose access.",
    "share.noLinks": "No active links yet.",
    "share.loadError": "Couldn’t load sharing settings.",
    "share.actionError": "Something went wrong. Please try again.",
    "share.close": "Close",

    // shared (public, view-only) trip page
    "shared.badge": "View only",
    "shared.notFoundTitle": "This link isn’t available",
    "shared.notFoundBody":
      "It may have been revoked, or the trip no longer exists.",
    "shared.loadError": "Couldn’t load this trip.",
    "shared.openApp": "Open {app}",
  },

  he: {
    "app.name": "TravelPal",
    "app.tagline": "מגלים יחד",
    "nav.main": "ראשי",
    "nav.sections": "חלקי הטיול",
    "nav.view": "תצוגה",
    "nav.plan": "תכנון",
    "nav.details": "פרטים",
    "nav.budget": "תקציב",
    "nav.discover": "גילוי",
    "nav.share": "שיתוף הטיול",
    "nav.settings": "הגדרות",
    "tab.destinations": "יעדים",
    "tab.details": "פרטים",
    "tab.dayByDay": "תכנון יומי",
    "tab.budget": "תקציב",

    // trips (multi-trip switcher)
    "trips.switch": "החלפת טיול",
    "trips.label": "הטיולים שלך",
    "trips.new": "טיול חדש",
    "trips.newTitle": "טיול חדש",
    "trips.delete": "מחיקת {name}",
    "trips.confirmDelete": "למחוק את „{name}“ ואת כל התוכן שלו? לא ניתן לבטל.",

    // auth (magic-link sign in / sign up)
    "auth.tagline": "לתכנן טיולים שנשמרים בדפדפן — ועכשיו גם בחשבון שלך.",
    "auth.emailLabel": "כתובת אימייל",
    "auth.emailPlaceholder": "you@example.com",
    "auth.send": "שליחת קישור כניסה",
    "auth.sending": "שולח…",
    "auth.sentTitle": "בדקו את תיבת הדואר",
    "auth.sentBody":
      "שלחנו קישור כניסה אל {email}. פתחו אותו במכשיר הזה כדי להמשיך.",
    "auth.differentEmail": "שימוש בכתובת אחרת",
    "auth.resend": "שליחת הקישור שוב",
    "auth.resending": "שולח שוב…",
    "auth.resent": "הקישור נשלח",
    "auth.localOnly": "המשך ללא חשבון",
    "auth.localOnlyHint": "הטיולים יישארו במכשיר הזה ולא יסונכרנו.",
    "auth.invalidEmail": "הזינו כתובת אימייל תקינה.",
    "auth.error": "שליחת הקישור נכשלה. נסו שוב.",
    "auth.passwordToggle": "כניסה עם סיסמה במקום זאת",
    "auth.passwordLabel": "סיסמה",
    "auth.passwordSignIn": "כניסה",
    "auth.passwordSigningIn": "מתחבר…",
    "auth.passwordError": "אימייל או סיסמה שגויים.",
    "auth.backToMagicLink": "חזרה לקישור באימייל",

    // trip picker (the landing screen after signing in)
    "picker.title": "הטיולים שלך",
    "picker.subtitle": "בחרו טיול לפתיחה, או התחילו טיול חדש.",
    "picker.new": "טיול חדש",
    "picker.open": "פתיחת {name}",
    "picker.nights": "{count} לילות",
    "picker.signedInAs": "מחוברים כ־{email}",
    "picker.signOut": "התנתקות",
    "picker.localMode": "שימוש ללא חשבון",
    "picker.signInToSync": "התחברו לסנכרון",
    "picker.sharedBadge": "שותף איתך",
    "picker.invitationsTitle": "הזמנות לטיולים",
    "picker.invitationsSubtitle":
      "מישהו שיתף איתך טיול — אשרו כדי להתחיל לערוך, או הסירו אם זה נשלח בטעות.",
    "picker.accept": "אישור",
    "picker.decline": "הסרה",
    "picker.acceptInvitation": "אישור ההזמנה ל{name}",
    "picker.declineInvitation": "דחיית ההזמנה ל{name}",
    "picker.leaveTrip": "הסרת {name} מהטיולים שלך",
    "picker.confirmLeave":
      "להסיר את „{name}“ מהטיולים שלך? הטיול נשאר אצל הבעלים, ותוכלו לקבל הזמנה חוזרת אם זו הייתה טעות.",
    "header.allTrips": "כל הטיולים",
    "header.menu": "תפריט",
    "header.goTo": "מעבר אל",

    "lang.label": "שפה",
    "lang.change": "שינוי שפה",
    "theme.label": "ערכת נושא",
    "theme.light": "בהיר",
    "theme.dark": "כהה",
    "theme.system": "לפי המערכת",
    "theme.switchTo": "החלפת ערכת נושא (כרגע {mode})",

    "header.editTrip": "עריכת שם הטיול והתאריכים",
    "header.title": "שם הטיול",
    "header.startDate": "תאריך התחלה",
    "header.endDate": "תאריך סיום",
    "header.done": "סיום",
    "header.costIn": "עלות ב־",
    "header.currency": "מטבע התצוגה",
    "header.nights": "לילות",
    "header.planned": "מתוכננים",
    "header.nightsPlanned": "{value} מתוך {total} לילות מתוכננים",
    "header.exportPdf": "ייצוא ל-PDF",
    "header.overplanned":
      "תכננת {planned} לילות אך הטיול נמשך {total} לילות בלבד. הארך את תאריך הסיום או קצר עצירה.",
    "offline.download": "הורדה לשימוש לא מקוון",
    "offline.downloaded": "זמין גם לא מקוון",
    "offline.banner":
      "אתם לא מחוברים לרשת — מוצג העותק האחרון הזמין. שינויים לא יישמרו עד שתחזרו להיות מחוברים.",
    "plan.destination": "יעד",
    "plan.nights": "לילות",
    "plan.accommodationCol": "לינה",
    "plan.order": "סדר",
    "plan.night": "לילה",
    "plan.nightsPlural": "לילות",
    "plan.addPlaceholder": "הוספת יעד חדש…",
    "plan.searchLabel": "חיפוש יעד להוספה",
    "plan.emptyTitle": "אין עדיין עצירות",
    "plan.emptyBody":
      "חפשו למטה כדי להוסיף את היעד הראשון למפה ולהתחיל לבנות את המסלול.",
    "plan.autoDates":
      "התאריכים מתעדכנים אוטומטית כשמוסיפים לילות או משנים את סדר העצירות.",
    "plan.nameLabel": "שם יעד {n}",
    "plan.addNight": "הוספת לילה ב{name}",
    "plan.removeNight": "הסרת לילה ב{name}",
    "plan.dragHint": "גררו לשינוי הסדר",
    "plan.openDayHint": "לחיצה כפולה לפתיחת העצירה בתכנון היומי",
    "plan.moveEarlier": "הזזת {name} מוקדם יותר",
    "plan.moveLater": "הזזת {name} מאוחר יותר",
    "plan.remove": "הסרת {name}",
    "plan.addOrigin": "הוספת מוצא לטיול",
    "plan.originPlaceholder": "מאיפה הטיול מתחיל (למשל הבית)…",
    "plan.originSearchLabel": "חיפוש נקודת המוצא של הטיול",
    "plan.originNameLabel": "שם מוצא הטיול",
    "plan.removeOrigin": "הסרת מוצא הטיול",
    "plan.cancelAddOrigin": "ביטול הוספת מוצא הטיול",
    "plan.originShowOnMap": "הצגה על המפה",
    "plan.originNotPlaced": "בחרו מקום אמיתי מהחיפוש כדי להציג אותו על המפה",
    "plan.addLastStop": "הוספת עצירה אחרונה",
    "plan.lastStopPlaceholder": "איפה הטיול מסתיים (למשל הבית)…",
    "plan.lastStopSearchLabel": "חיפוש העצירה האחרונה של הטיול",
    "plan.lastStopNameLabel": "שם העצירה האחרונה",
    "plan.removeLastStop": "הסרת העצירה האחרונה",
    "plan.cancelAddLastStop": "ביטול הוספת עצירה אחרונה",
    "plan.sameAsOrigin": "זהה למוצא",
    "plan.useOriginAsLastStop": "להשתמש במוצא הטיול ({name})",

    "sleeping.title": "לינה",
    "sleeping.accommodation": "שם",
    "sleeping.placeholder": "מלון, הוסטל או דירה",
    "sleeping.perNight": "עלות ללילה",
    "sleeping.docsHint": "אישורי ההזמנה נמצאים בלשונית הפרטים.",

    "transport.mode": "אמצעי",
    "transport.duration": "משך (דקות)",
    "transport.distance": "מרחק (ק״מ)",
    "transport.cost": "עלות",
    "transport.add": "הוספת תחבורה",
    "transport.addDetails": "הוספת זמנים ועלויות",
    "transport.addSegment": "הוספת תחבורה נוספת",
    "transport.removeSegment": "הסרת תחבורה {n}",
    "transport.dragHint": "גררו לשינוי הסדר",
    "transport.removeField": "הסרת {field}",
    "transport.durationShort": "משך",
    "transport.distanceShort": "מרחק",
    "transport.change": "החלפה אחת",
    "transport.changes": "{n} החלפות",
    "transport.originStation": "תחנת מוצא",
    "transport.destinationStation": "תחנת יעד",
    "transport.originPlaceholder": "תחנה, שדה תעופה או עצירה…",
    "transport.destinationPlaceholder": "תחנה, שדה תעופה או עצירה…",
    "transport.useStraight": "שימוש במרחק אווירי ({km} ק״מ)",
    "transport.to": "{mode} אל {name}",
    "transport.docs": "מסמכים עבור תחבורה {n}",
    "transport.docLabel": "מסמך תחבורה",
    "transport.docHint": "גררו כרטיסים או כרטיסי עלייה לכאן, או",
    "mode.plane": "טיסה",
    "mode.train": "רכבת",
    "mode.bus": "אוטובוס",
    "mode.car": "רכב",
    "mode.ferry": "מעבורת",
    "mode.walk": "הליכה",

    "details.destinations": "יעדים",
    "details.empty": "הוסיפו יעד תחילה — ההערות והמסמכים שלו יופיעו כאן.",
    "details.stop": "עצירה {n}",
    "details.notes": "הערות",
    "details.notesPlaceholder": "מספרי הזמנה, עם מי נפגשים, מה לארוז…",
    "details.travelDocs": "מסמכי נסיעה",
    "details.travelHint": "כרטיסים, כרטיסי עלייה למטוס, ויזות, ביטוח —",
    "details.sleepingDocs": "מסמכי לינה",
    "details.sleepingHint": "אישורי מלון, פרטי צ׳ק־אין, כתובות —",
    "details.allDocuments": "כל המסמכים",
    "details.allDocumentsEmpty": "עדיין אין מסמכים ליעד הזה.",
    "details.tagAccommodation": "לילה {n} · לינה",
    "details.tagReservation": "לילה {n} · {name}",
    "details.tagTransport": "תחבורה · {mode}",
    "docs.title": "מסמכים",
    "docs.file": "קובץ",
    "docs.files": "קבצים",
    "docs.none": "אין",
    "docs.browse": "עיון",
    "docs.dropHint": "גררו קבצים לכאן, או",
    "docs.privacy": "נשמר באופן פרטי בדפדפן · עד {size} לקובץ",
    "docs.tooBig": "״{name}״ במשקל {size} — המגבלה היא {max}.",
    "docs.storeFailed": "לא ניתן לשמור את ״{name}״. ייתכן שאחסון הדפדפן מלא.",
    "docs.syncFailed": "״{name}״ נשמר במכשיר זה, אך לא ניתן היה לסנכרן לענן.",
    "docs.preview": "תצוגה מקדימה של {name}",
    "docs.download": "הורדת {name}",
    "docs.delete": "מחיקת {name}",
    "docs.closePreview": "סגירת התצוגה המקדימה",
    "docs.loading": "טוען…",
    "docs.localOnlyNote": "זמין במכשיר זה בלבד.",
    "docs.signInLink": "התחברו כדי לסנכרן בין מכשירים",

    "day.empty": "עדיין לא תוכנן דבר — הוסיפו יעד בלשונית היעדים.",
    "day.number": "יום {n}",
    "day.done": "{done}/{total} הושלמו",
    "day.toggle": "{action} תוכניות ליום {n}",
    "day.show": "הצגת",
    "day.hide": "הסתרת",
    "day.to": "אל {name}",
    "attractions.title": "אטרקציות",
    "attractions.placeholder": "מקדש, מוזיאון, נקודת תצפית…",
    "attractions.add": "הוספת אטרקציה",
    "attractions.addBlank": "הוספת אטרקציה ריקה",
    "attractions.cost": "עלות האטרקציה",
    "attractions.time": "שעת האטרקציה",
    "attractions.remove": "הסרת {name}",
    "attractions.fallback": "אטרקציה",
    "attractions.dragHint": "גררו לשינוי הסדר",
    "attractions.searchPlaceholder": "חיפוש אטרקציות ומקומות מפורסמים…",
    "attractions.searchLabel": "חיפוש אטרקציה להוספה",
    "attractions.searchError": "החיפוש אינו זמין כרגע — נסו שוב בעוד רגע.",
    "attractions.addRoute": "הוספת מסלול",
    "attractions.useEstimate": "שימוש בהערכה ({km} ק״מ · {time})",
    "dayStay.title": "לינה",
    "dayStay.add": "הוספה ללילה הזה",
    "dayStay.remove": "הסרת הלינה של הלילה הזה",
    "dayStay.badge": "הלילה הזה",
    "dayStay.inherited": "משתמש ב{name} של היעד.",
    "dayStay.inheritedNone": "לא הוגדרה לינה ליעד — אפשר להוסיף רק ללילה הזה.",
    "dayStay.name": "מקום לינה",
    "dayStay.cost": "עלות",
    "dayStay.address": "כתובת",
    "dayStay.addressPlaceholder": "רחוב, אזור או נקודת צ׳ק־אין…",
    "dayStay.docs": "מסמכי הזמנה",
    "dayStay.docsHint": "גררו את האישור לכאן, או",

    "biz.badge": "עסק",
    "biz.loading": "מחפש עסקים…",
    "biz.error": "חיפוש העסקים אינו זמין כרגע.",
    "source.google": "Google",
    "source.nominatim": "Nominatim",
    "source.bizdata": "BizData",
    "biz.museum": "מוזיאונים",
    "biz.gallery": "גלריות",
    "biz.theatre": "תיאטראות",
    "biz.restaurant": "מסעדות",
    "biz.cafe": "בתי קפה",
    "biz.bar": "ברים",
    "biz.hotel": "מלונות",
    "biz.hostel": "הוסטלים",
    "biz.supermarket": "סופרמרקטים",
    "biz.pharmacy": "בתי מרקחת",
    "unit.km": "ק״מ",
    "reserved.title": "הזמנות",
    "reserved.placeholder": "מסעדה, סיור, הסעה…",
    "reserved.add": "הוספת הזמנה",
    "reserved.time": "שעת ההזמנה",
    "reserved.cost": "עלות ההזמנה",
    "reserved.remove": "הסרת {name}",
    "reserved.fallback": "הזמנה",
    "reserved.docs": "מסמכים עבור {name}",
    "reserved.docLabel": "מסמך ההזמנה",
    "reserved.docHint": "גררו את האישור לכאן, או",
    "reserved.markDone": "סימון {name} כהושלם",

    "budget.total": "סך הטיול",
    "budget.perNight": "ללילה",
    "budget.sleeping": "לינה",
    "budget.transport": "תחבורה",
    "budget.attractions": "אטרקציות",
    "budget.reserved": "הזמנות",
    "budget.shareOfTotal": "{n}% מהסך",
    "budget.byDestination": "לפי יעד",
    "budget.empty": "הוסיפו יעדים כדי לראות את חלוקת התקציב.",
    "budget.perNightRate": "{amount} ללילה",
    "budget.origin": "מוצא הטיול",
    "budget.originTransport": "תחבורה לעצירה הראשונה",
    "budget.lastStop": "העצירה האחרונה",
    "budget.lastStopNote": "נספר בעלות העצירה שלפניה",
    "budget.note":
      "עלות הלינה מוכפלת במספר הלילות בכל עצירה, למעט לילות עם לינה משלהם — שמחליפה אותה. התחבורה נספרת על הקטע היוצא מכל יעד. אטרקציות והזמנות מסוכמות מהתכנון היומי.",

    "map.label": "מפה",
    "map.style": "סגנון המפה",
    "map.streets": "רחובות",
    "map.minimal": "מינימלי",
    "map.terrain": "טופוגרפי",
    "map.satellite": "לוויין",
    "map.google": "מפות גוגל",
    "map.empty": "הוסיפו יעד כדי לראות אותו כאן",
    "map.dayRoute": "מסלול ב{name}",
    "map.dayEmpty": "חפשו אטרקציות כדי לבנות כאן מסלול",
    "map.openDetails": "לחצו לפתיחת הפרטים",
    "map.close": "סגירת המפה",
    "map.resize": "שינוי רוחב המפה",
    "map.resizeHint": "גררו לשינוי הגודל · לחיצה כפולה לאיפוס",

    "misc.comingNext": "בקרוב",
    "discover.body": "עיינו בעצירות מומלצות והוסיפו אותן ישירות למסלול.",

    "pdf.untitledTrip": "טיול",
    "pdf.generatedBy": "נוצר בתאריך {date} על ידי {username}",
    "pdf.localDevice": "מכשיר מקומי",
    "pdf.country": "מדינה",
    "pdf.from": "מתאריך",
    "pdf.to": "עד תאריך",
    "pdf.cost": "עלות",
    "pdf.onwardTransport": "המשך הנסיעה",
    "pdf.date": "תאריך",
    "pdf.stop": "עצירה",
    "pdf.plan": "תוכנית",
    "pdf.noPlans": "אין תוכניות",
    "pdf.attraction": "אטר֧ציה",
    "pdf.reservation": "הזמנה",
    "pdf.category": "קטגוריה",
    "pdf.map": "מפת המסלול",
    "pdf.footer": "{app} — סיכום טיול",

    "share.subtitle": "הזמינו מישהו לערוך, או שתפו קישור לצפייה בלבד.",
    "share.inviteLabel": "הזמנת מישהו לעריכה",
    "share.emailPlaceholder": "email@example.com",
    "share.invite": "הזמנה",
    "share.inviting": "מזמין…",
    "share.invited": "הוזמנו — יקבלו גישת עריכה ברגע שיאשרו את ההזמנה.",
    "share.invitePending":
      "ההזמנה נשמרה — הגישה תינתן ברגע שיירשמו עם האימייל הזה.",
    "share.invitePendingNoEmail":
      "ההזמנה נשמרה, אך לא הצלחנו לשלוח להם אימייל — עדכנו אותם בעצמכם.",
    "share.inviteError": "שליחת ההזמנה נכשלה. נסו שוב.",
    "share.collaborators": "מי יכול לערוך",
    "share.noCollaborators": "אף אחד אחר לא יכול לערוך את הטיול הזה עדיין.",
    "share.awaitingAccept": "ממתין לאישור",
    "share.pendingInvites": "ממתינים להרשמה",
    "share.removeCollaborator": "הסרת {email}",
    "share.cancelInvite": "ביטול ההזמנה ל{email}",
    "share.linkTitle": "קישור לצפייה בלבד",
    "share.linkHint":
      "כל מי שיש לו את הקישור יכול לצפות בטיול — לא לערוך אותו.",
    "share.labelPlaceholder": "הערה אופציונלית (למשל, למי זה מיועד)",
    "share.createLink": "יצירת קישור",
    "share.creatingLink": "יוצר…",
    "share.copyLink": "העתקת קישור",
    "share.linkCopied": "הועתק!",
    "share.revokeLink": "ביטול",
    "share.confirmRevoke": "לבטל את הקישור הזה? כל מי שמשתמש בו יאבד גישה.",
    "share.noLinks": "אין עדיין קישורים פעילים.",
    "share.loadError": "טעינת הגדרות השיתוף נכשלה.",
    "share.actionError": "משהו השתבש. נסו שוב.",
    "share.close": "סגירה",

    "shared.badge": "צפייה בלבד",
    "shared.notFoundTitle": "הקישור הזה אינו זמין",
    "shared.notFoundBody": "ייתכן שהוא בוטל, או שהטיול כבר לא קיים.",
    "shared.loadError": "טעינת הטיול נכשלה.",
    "shared.openApp": "פתיחת {app}",
  },
};

/* -------------------------------------------------------------------------- */

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    // fall through to detection
  }
  // Fall back to the browser's preference before defaulting to English.
  return navigator.language?.toLowerCase().startsWith("he") ? "he" : "en";
}

let lang = readStored();
const listeners = new Set();

export const dirOf = (code) =>
  LANGUAGES.find((l) => l.code === code)?.dir ?? "ltr";

function apply() {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = dirOf(lang);
}

apply();

export function setLanguage(next) {
  if (!LANGUAGES.some((l) => l.code === next)) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Non-fatal: the choice just won't survive a reload.
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Interpolates {placeholders}; falls back to English, then to the key. */
export function translate(code, key, vars) {
  const value = STRINGS[code]?.[key] ?? STRINGS.en[key] ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function useI18n() {
  const code = useSyncExternalStore(
    subscribe,
    () => lang,
    () => lang,
  );

  return {
    lang: code,
    dir: dirOf(code),
    rtl: dirOf(code) === "rtl",
    dateLocale: DATE_LOCALES[code] ?? enGB,
    intlLocale: INTL_LOCALES[code] ?? "en-GB",
    t: (key, vars) => translate(code, key, vars),
  };
}

/** For modules that need the current locale outside React. */
export const currentLocale = () => INTL_LOCALES[lang] ?? "en-GB";
export const currentDateLocale = () => DATE_LOCALES[lang] ?? enGB;
export const currentLang = () => lang;
