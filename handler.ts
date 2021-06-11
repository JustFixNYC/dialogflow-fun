import { geoSearch, GeoSearchResults } from "@justfixnyc/geosearch-requester/commonjs";
import fetch from "node-fetch";


export type DialogFlowLocation = {
    'business-name': string,
    'street-address': string,
    'subadmin-area': string,
    'city': string,
    'zip-code': string
}

export type DialogflowWebhookRequest = {
  queryResult: {
    queryText: string;
    parameters: {
      location: DialogFlowLocation
    };
    intent: {
      displayName: string
    }
  }
};

export type DialogflowWebhookResponse = {
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

async function fetchLandlordInfo(bbl: string): Promise<SearchResults> {
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

function classifyIntent(intentDisplayName: string): string {
  if (intentDisplayName.includes('ConfirmAddress')) {
    return 'confirm-address';
  } else if (intentDisplayName.includes('HousingType')) {
    return 'predict-housing-type';
  } else {
    return 'get-landlord-info';
  }
}

function formatAddress(location: DialogFlowLocation): string {
  let addr = location["street-address"] || location['business-name'];
  if (location['subadmin-area']) {
    addr += ', ' + location['subadmin-area'];
  }
  if (location['zip-code']) {
    addr += ', ' + location['zip-code'];
  }
  return addr;
}

async function getLandlordInfoResponse(geoResult: GeoSearchResults): Promise<string> {
  let text = "Unfortunately, I was unable to find any information about the landlord at that address.";

  if (geoResult.features.length > 0) {
    const feature = geoResult.features[0];
    const bbl = feature.properties.pad_bbl;
    const addr = `${feature.properties.name}, ${feature.properties.borough}`;
    const landlord = await fetchLandlordInfo(bbl);

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
  return text;
}

function confirmAddressResponse(geoResult: GeoSearchResults): string {
  let text = "I couldn't find that address. Can you tell me your full street address (no apartment number), borough, and zip? e.g. '150 Court St, Brooklyn, 11201'";
  if (geoResult.features.length > 0) {
    const feature = geoResult.features[0];
    const addr = `${feature.properties.name}, ${feature.properties.borough}`;
    text = `I found ${addr}. Is that right?`
  }
  return text;
}

async function predictHousingTypeResponse(geoResult: GeoSearchResults): Promise<string> {
  let text = "It doesn't look like your building has any rent regulated units.";
  // set to market rate as default?
  if (geoResult.features.length > 0) {
    const feature = geoResult.features[0];
    const bbl = feature.properties.pad_bbl;
    const addr = `${feature.properties.name}, ${feature.properties.borough}`;
    const predictedHousingType = await predictHousingType(bbl);
    text = `Looks like you might live in ${predictedHousingType}`;
    // make sure to also set follow up intent so it goes to the correct housing type intent.
  }
  return text;
}


export async function handleRequest(dfReq: DialogflowWebhookRequest): Promise<DialogflowWebhookResponse> {
  console.log(dfReq.queryResult);

  const loc = dfReq.queryResult.parameters.location;
  let addr = formatAddress(loc);
  const geoResult = await geoSearch(addr, {
    fetch: fetch as any
  });

  let responseText = '';
  switch(classifyIntent(dfReq.queryResult.intent.displayName)) {
    case 'confirm-address':
      responseText = confirmAddressResponse(geoResult);
      break;
    case 'predict-housing-type':
      predictHousingTypeResponse(geoResult).then(
        res => {
          responseText = res;
        }
      );
      break;
    case 'get-landlord-info':
      getLandlordInfoResponse(geoResult).then(
        res => {
          responseText = res;
        }
      );
      break;
    default:
      responseText = "I don't know how to handle this yet";
      break;
  }



  const dfRes: DialogflowWebhookResponse = {
    fulfillmentMessages: [{
      text: {
        text: [responseText],
      }
    }]
  };

  return dfRes;
}
