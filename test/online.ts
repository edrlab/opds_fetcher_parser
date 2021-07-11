import { dir } from "console";
import { OpdsService } from "../src/service/opds";

const opds = new OpdsService();



(async () => {

  
  const feed = await opds.feedRequest("https://storage.googleapis.com/audiobook_edrlab/feed.json");


  console.log("####");
  console.log("####");
  console.log("####");
  
  dir(feed);

  console.log("####");
  console.log("####");
  console.log("####");
  
  const webpub = await opds.webpubRequest("https://storage.googleapis.com/audiobook_edrlab/webpub/assommoir_emile_zola.json");

  dir(webpub);

  console.log("####");
  console.log("####");
  console.log("####");

})();


