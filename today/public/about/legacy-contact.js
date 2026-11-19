// Keep links to the former About page contact section working.
function openContact() {
  if (location.hash === "#contact") location.replace("/contact/");
}

addEventListener("hashchange", openContact);
openContact();
