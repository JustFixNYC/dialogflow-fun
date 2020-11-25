import express from "express";
import bodyParser from "body-parser";
import { geoSearch } from "@justfixnyc/geosearch-requester/commonjs";
import fetch from "node-fetch";

(globalThis as any).fetch = fetch;

type DialogflowWebhookRequest = {
  queryResult: {
    queryText: string;
    parameters: {
      location: {
        'business-name': string,
        'street-address': string,
        'subadmin-area': string,
      }
    }
  }
};

type DialogflowWebhookResponse = {
  fulfillmentMessages: {
    text: {
      text: string[]
    }
  }[]
};

function splitBBL(bbl: string) {
  const bblArr = bbl.split("");
  const boro = bblArr.slice(0, 1).join("");
  const block = bblArr.slice(1, 6).join("");
  const lot = bblArr.slice(6, 10).join("");
  return { boro, block, lot };
}

async function getLandlordInfo(bbl: string): Promise<SearchResults> {
  const url = new URL('https://wow-django.herokuapp.com/api/address');
  const params = splitBBL(bbl);
  url.searchParams.append('borough', params.boro);
  url.searchParams.append('block', params.block);
  url.searchParams.append('lot', params.lot);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Got HTTP ${res.status}`);
  }
  return res.json();
}

type GeoSearchData = {
  bbl: string;
};

type Borough = "MANHATTAN" | "BRONX" | "BROOKLYN" | "QUEENS" | "STATEN ISLAND";

type HpdOwnerContact = {
  title: string;
  value: string;
};

/** Date fields that come from our API Data are strings with the format YYYY-MM-DD */
type APIDate = string;

type AddressRecord = {
  bbl: string;
  bin: string;
  boro: Borough;
  businessaddrs: string[] | null;
  corpnames: string[] | null;
  evictions: number | null;
  housenumber: string;
  lastregistrationdate: APIDate;
  lastsaleacrisid: string | null;
  lastsaleamount: number | null;
  lastsaledate: APIDate | null;
  lat: number | null;
  lng: number | null;
  /** This property gets assigned in the PropertiesMap component, not from our API */
  mapType?: "base" | "search";
  openviolations: number;
  ownernames: HpdOwnerContact[] | null;
  registrationenddate: APIDate;
  registrationid: string;
  rsdiff: number | null;
  rsunits2007: number | null;
  rsunitslatest: number | null;
  rsunitslatestyear: number;
  streetname: string;
  totalviolations: number;
  unitsres: number | null;
  yearbuilt: number | null;
  zip: string | null;
};

type SearchResults = {
  addrs: AddressRecord[];
  geosearch?: GeoSearchData;
};

const PORT = process.env['PORT'] || '3000';

const app = express();

app.use(bodyParser.json());

app.post('/', async (req, res) => {
  const dfReq: DialogflowWebhookRequest = req.body;
  const loc = dfReq.queryResult.parameters.location;
  let addr = loc["street-address"] || loc['business-name'];
  if (loc['subadmin-area']) {
    addr += ', ' + loc['subadmin-area'];
  }
  const geoResult = await geoSearch(addr);

  let text = "Unfortunately, I was unable to find any information about the landlord at that address.";

  if (geoResult.features.length > 0) {
    const feature = geoResult.features[0];
    const bbl = feature.properties.pad_bbl;
    const addr = `${feature.properties.name}, ${feature.properties.borough}`;
    const landlord = await getLandlordInfo(bbl);

    if (landlord.addrs.length === 0) {
      text = `Alas, I couldn't find any information about the landlord at ${addr}.`;
    } else {
      if (landlord.addrs.length === 1) {
        text = `The landlord at ${addr} does not own any other buildings.`;
      } else {
        text = `The landlord at ${addr} owns ${landlord.addrs.length} buildings.`;
      }
      text += ` Learn more at https://whoownswhat.justfix.nyc/bbl/${bbl}.`;
    }
  }

  const dfRes: DialogflowWebhookResponse = {
    fulfillmentMessages: [{
      text: {
        text: [text],
      }
    }]
  };
  res.json(dfRes);
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}.`);
});
