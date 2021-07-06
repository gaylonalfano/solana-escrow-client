<template>
  <div v-if="walletRef">
    <h2>Wallet PubKey: {{ walletRef.publicKey }}</h2>
  </div>

  <router-view />
</template>


<script lang="ts">
import { Connection } from "@solana/web3.js";
import { defineComponent, watchEffect, ref } from "vue";
import { initWallet, WalletAdapter } from "./util/useWallet";

export default defineComponent({
  name: "App",
  setup: () => {
    const connectionRef = ref<Connection>();
    const walletRef = ref<WalletAdapter>();

    watchEffect(() => {
      console.log("watchEffect triggered");
      initWallet().then(([connection, wallet]: [Connection, WalletAdapter]) => {
        // Update our Refs so we can reuse inside didSendMoney()
        connectionRef.value = connection;
        walletRef.value = wallet;
        //console.log(connectionRef.value);
        //console.log(walletRef.value);

        // Make sure wallet has publicKey
        // Q: Should I check walletRef or just wallet?
        if (wallet.publicKey) {
          console.log("walletRef.value.publicKey: ", walletRef.value.publicKey); // Proxy
          console.log("wallet.publicKey: ", wallet.publicKey); // PublicKey
        }
      });
    });

    return { walletRef };
  },
});
</script>


<style>
@import url("https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap");

html,
body {
  font-family: "PT Serif", serif;
  margin: 0;
}

.bg {
  margin: 0;
  margin-top: 0.5rem;
  padding: 0.1rem 1rem;
  border-radius: 0.4rem;
  background-color: #f0f4f8;
}

.title {
  font-weight: bold;
}

.mb-1 {
  margin-bottom: 1rem;
}

.display-block {
  display: block;
}

.cursor-pointer {
  cursor: pointer;
}

.border-none {
  border: none;
}

.bg-btn {
  background-color: #ededed;
  transition: 0.3s;
}

.bg-btn:hover {
  background-color: #02b57b;
}

.normal-font-size {
  font-size: 0.85rem;
}
</style>
