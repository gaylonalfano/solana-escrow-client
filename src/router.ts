import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from "vue-router";

const Alice = () => import("./Alice.vue");
const Bob = () => import("./Bob.vue");

export default createRouter({
  // NOTE Use CreateWebHistory to remove the Hash
  history: createWebHistory(process.env.BASE_URL),
  routes: [
    {
      name: "Alice",
      path: "/",
      component: Alice,
    },
    {
      name: "Bob",
      path: "/bob",
      component: Bob,
    },
  ],
});
