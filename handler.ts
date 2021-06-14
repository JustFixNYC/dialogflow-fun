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
  session: string,
  queryResult: QueryResult
};

export type QueryResult = {
  queryText: string;
  parameters: {
    location: DialogFlowLocation
  };
  intent: {
    displayName: string
  }
  outputContexts?: OutputContext[]
};

export type OutputContext = {
  name: string,
  lifespanCount: number,
  parameters: {}
};

export type DialogflowWebhookResponse = {
  fulfillmentMessages: {
    text: {
      text: string[]
    }
  }[],
  outputContexts?: OutputContext[]
};

function createDialogflowWebhookResponse(text: string, outputContexts?: OutputContext[]): DialogflowWebhookResponse {
  let response: DialogflowWebhookResponse = 
  {
    fulfillmentMessages: [
      {
        text: {
          text: [text]
        }
      }
    ],
  };
  if (outputContexts) {
    response.outputContexts = outputContexts;
  }
  return response;
}

function splitBBL(bbl: string) {
  const bblArr = bbl.split("");
  const boro = bblArr.slice(0, 1).join("");
  const block = bblArr.slice(1, 6).join("");
  const lot = bblArr.slice(6, 10).join("");
  return { boro, block, lot };
}

async function fetchLandlordInfo(bbl: string): Promise<LandlordSearchResults> {
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

async function fetchHousingTypePrediction(bbl: string): Promise<HousingTypeResults> {
  const url = new URL('https://wow-django.herokuapp.com/api/address/housingtype');
  url.searchParams.append('bbl', bbl);
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

type LandlordSearchResults = {
  addrs: AddressRecord[];
  geosearch?: GeoSearchData;
};

type HousingTypeResults = {
  result: string;
}

function classifyIntent(intentDisplayName: string): string {
  if (intentDisplayName.endsWith('ConfirmAddress')) {
    return 'confirm-address';
  } else if (intentDisplayName.includes('HousingTypeUnsure') && intentDisplayName.endsWith('ConfirmAddress - yes')) {
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

async function getLandlordInfoResponse(queryResult: QueryResult): Promise<DialogflowWebhookResponse> {
  const loc = queryResult.parameters.location;
  let addr = formatAddress(loc);
  const geoResult = await geoSearch(addr, {
    fetch: fetch as any
  });

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
  return createDialogflowWebhookResponse(text);
}

async function confirmAddressResponse(queryResult: QueryResult): Promise<DialogflowWebhookResponse> {
  const loc = queryResult.parameters.location;
  let addr = formatAddress(loc);
  const geoResult = await geoSearch(addr, {
    fetch: fetch as any
  });

  let text = "I couldn't find that address. Can you tell me your full street address (no apartment number), borough, and zip? e.g. '150 Court St, Brooklyn, 11201'";
  if (geoResult.features.length > 0) {
    const feature = geoResult.features[0];
    const addr = `${feature.properties.name}, ${feature.properties.borough}`;
    text = `I found ${addr}. Is that right?`
  }
  return createDialogflowWebhookResponse(text);
}

async function predictHousingTypeResponse(queryResult: QueryResult, session: string): Promise<DialogflowWebhookResponse> {
  let text = "It doesn't look like your building has any rent regulated units.";

  // TODO: Find a way to get the georesult, which should be the already-found & validated address, from
  // the response to the last query (since when this gets called, the last thing the user has said is 'yes'
  // to indicate the address we have for them is oK). Do we have to store it on the server side? That would make
  // this stateful - which i guess is oK.

  let predictedHousingType = '';
  if (geoResult.features.length > 0) {
    const feature = geoResult.features[0];
    const bbl = feature.properties.pad_bbl;
    predictedHousingType = (await fetchHousingTypePrediction(bbl)).result;
    console.log(predictedHousingType);
    text = `Looks like you might live in ${predictedHousingType}`;
  }

  let outputContexts = [
    {
      name: `${session}/contexts/housing-type-found`,
      lifespanCount: 10,
      parameters: {
        'housing-type': predictedHousingType
      }
    },
  ];
  return createDialogflowWebhookResponse(text, outputContexts);
}


export async function handleRequest(dfReq: DialogflowWebhookRequest): Promise<DialogflowWebhookResponse> {
  console.log(dfReq.queryResult);
  if (dfReq.queryResult.outputContexts) {
    for (let i = 0; i<dfReq.queryResult.outputContexts.length; i++) {
      console.log(dfReq.queryResult.outputContexts[i].name);
      console.log(' and the parameter value is ');
      console.log(dfReq.queryResult.outputContexts[i].parameters);
    }
  }



  const queryResult = dfReq.queryResult;
  const session = dfReq.session;

  let response = createDialogflowWebhookResponse("I don't know how to handle this yet");
  switch(classifyIntent(dfReq.queryResult.intent.displayName)) {
    case 'confirm-address':
      confirmAddressResponse(queryResult).then(
        res => {
          response = res;
        }
      )
      break;
    case 'predict-housing-type':
      predictHousingTypeResponse(queryResult, session).then(
        res => {
          response = res;
        }
      );
      break;
    case 'get-landlord-info':
      getLandlordInfoResponse(queryResult).then(
        res => {
          response = res;
        }
      );
      break;
    default:
      break;
  }
  console.log("about to send response: ");
  console.log(response)

  return response;
}
