import { mount } from "svelte";
import LoginForm from "$lib/components/LoginForm.svelte";
import "$lib/styles/tokens.css";

const target = document.getElementById("login-app");
if (target) {
  mount(LoginForm, { target });
}
