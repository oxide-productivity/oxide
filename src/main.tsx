import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Router } from "./Router";
import "@mantine/core/styles.css";
import "./index.css";

const theme = createTheme({
  fontFamily: "Outfit, Inter, sans-serif",
  primaryColor: "indigo",
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Router />
    </MantineProvider>
  </React.StrictMode>
);
