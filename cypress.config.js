import { defineConfig } from "cypress";
import open from "open";
import http from "http";
import url from "url";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  projectId: 'pbqoor',
  e2e: {
    baseUrl: "http://localhost:5000",
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 10000,
    setupNodeEvents(on, config) {
      // Pass JWT secret to cypress env
      config.env.JWT_SECRET = process.env.JWT_SECRET;
      
      on('task', {
        googleLogin({ clientId }) {
          return new Promise((resolve, reject) => {
            const redirectUri = "http://localhost:5173/auth/callback";
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`;
            
            // Create a temporary server to catch the callback
            const server = http.createServer((req, res) => {
              const reqUrl = url.parse(req.url, true);
              if (reqUrl.pathname === "/auth/callback") {
                const code = reqUrl.query.code;
                
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end("<html><body><h1>Login successful!</h1><p>You can close this window and return to Cypress.</p><script>window.close();</script></body></html>");
                
                server.close(() => {
                  resolve(code);
                });
              } else {
                res.writeHead(404);
                res.end();
              }
            });

            server.listen(5173, () => {
              console.log("Temporary auth server listening on port 5173");
              // Open the Google login URL in the user's default browser
              open(authUrl).catch(err => {
                server.close();
                reject(err);
              });
            });

            // Timeout after 120 seconds
            setTimeout(() => {
              server.close();
              reject(new Error("Google Login timed out after 120 seconds"));
            }, 120000);
          });
        }
      });
      return config;
    },
  },
});
