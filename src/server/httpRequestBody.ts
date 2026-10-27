import express from "express";

/** Configure bounded JSON parsing while allowing the public PPDB endpoint to receive its six 1 MiB documents. */
export function configureRequestBodyParsing(app: express.Express): void {
  app.use(
    "/api/public/ppdb/registrations",
    express.json({ limit: "9mb" }),
  );
  app.use(express.json({ limit: "5mb" }));
}
