import app from "./app";
import { env } from "./config/env";



const PORT = env.PORT;


app.listen(PORT, () => {
  console.log(`FoodCheq backend listening on http://localhost:${PORT}`);
});
