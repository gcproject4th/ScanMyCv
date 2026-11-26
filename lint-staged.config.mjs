export default {
  "backend/**/*.js": () => "npm --prefix backend run lint",
  "frontend/**/*.{js,jsx}": () => "npm --prefix frontend run lint",
};
