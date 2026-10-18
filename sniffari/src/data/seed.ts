// Starter places for Sydney and NSW, entered by hand from official sources (17 Oct 2026).
// Each rule carries its source and the date it was checked. Pins marked approximateLocation
// are placed from the park's known location and still need checking on a map (scripts/geocode-seed.mjs).
// When the database is connected, these are loaded into it (scripts/seed-to-sql.mjs) and this file becomes a fallback.

import type { Place, Rule, Source } from "../domain/types";

const CHECKED = "2026-10-17";
const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const WEEKENDS_PH = [0, 6, "PH"] as const;

const official = (name: string, url: string): Source => ({ name, url, checked: CHECKED, kind: "official" });
const guide = (name: string, url: string): Source => ({ name, url, checked: CHECKED, kind: "guide" });

/** NSW law: dogs in public places must be on a lead unless in a declared off-leash area. */
const LEASH_LAW = official("NSW Companion Animals Act 1998, s13", "https://legislation.nsw.gov.au/view/html/inforce/current/act-1998-087#sec.13");
const NPWS_DOGS = official("NSW National Parks: Dogs in parks", "https://www.nationalparks.nsw.gov.au/conservation-and-heritage/care-for-parks/dogs-in-parks");

let n = 0;
const r = (rule: Omit<Rule, "id">): Rule => ({ id: `seed-${++n}`, ...rule });

const HILLS = official("The Hills Shire Council: Off-leash dog parks", "https://www.thehills.nsw.gov.au/Residents/Your-Family/Pets-Animals/Find-a-Local-Off-Leash-Dog-Park");
const BLACKTOWN = official("Blacktown City Council: Off leash areas", "https://www.blacktown.nsw.gov.au/Services/Pets-and-animals/Off-leash-areas");
const PARRAMATTA = official("City of Parramatta: Dog off leash", "https://cityofparramatta.nsw.gov.au/dog-parks");
const MOSMAN = official("Mosman Council: Where to walk your dog", "https://mosman.nsw.gov.au/residents/Pets/where-to-walk-your-dog");
const WOOLLAHRA = official("Woollahra Council: Walking your dog", "https://www.woollahra.nsw.gov.au/services/animals_and_pets/walking_your_dog");
const WAVERLEY = official("Waverley Council: Off-leash parks", "https://waverley.nsw.gov.au/residents/pets/offleash_parks");

export const SEED_PLACES: Place[] = [
  // ---------- Hills & north-west ----------
  {
    id: "bernie-mullane-ola", name: "Bernie Mullane Sports Complex dog park", kind: "off_leash_park", region: "hills_nw",
    area: "The Hills Shire Council", address: "Marella Ave, Kellyville", lat: -33.7185, lon: 150.9545, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: HILLS, rules: [],
    features: { fenced: "full", parking: true },
    notes: ["Fenced off-leash area at the sports complex.", "Max four dogs per handler; dogs must respond to voice command."],
  },
  {
    id: "rutherford-ave-reserve", name: "Rutherford Avenue Reserve", kind: "off_leash_park", region: "hills_nw",
    area: "The Hills Shire Council", address: "Rutherford Ave, North Kellyville", lat: -33.679, lon: 150.938, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: HILLS, rules: [],
    features: { fenced: "full" },
    notes: ["Off-leash only within the fenced area."],
  },
  {
    id: "indwarra-reserve", name: "Indwarra Avenue Reserve", kind: "off_leash_park", region: "hills_nw",
    area: "The Hills Shire Council", address: "Indwarra Ave, North Kellyville", lat: -33.6745, lon: 150.9465, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: HILLS, rules: [],
    features: { smallDogArea: true },
    notes: ["Council describes it as great for smaller dogs. Fencing not confirmed."],
  },
  {
    id: "coolong-reserve", name: "Coolong Reserve dog park", kind: "off_leash_park", region: "hills_nw",
    area: "The Hills Shire Council", address: "Coolong St, Castle Hill", lat: -33.7303, lon: 150.9926, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: official("The Hills Shire Council: Coolong Reserve", "https://www.thehills.nsw.gov.au/Venues/Parks-Recreation/Parks-Recreation-Directory/Coolong-Reserve"), rules: [],
    features: { fenced: "full" },
    notes: ["Fenced off-leash area beside the playing field."],
  },
  {
    id: "castle-hill-showground-arenas", name: "Castle Hill Showground dog arenas", kind: "off_leash_park", region: "hills_nw",
    area: "The Hills Shire Council", address: "Showground Rd, Castle Hill", lat: -33.7275, lon: 151.0075, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: HILLS, rules: [],
    features: { fenced: "full", parking: true },
    notes: ["Lower dog arenas are off-leash at all times, except when club training or competitions are on."],
  },
  {
    id: "bungarribee-dog-park", name: "Bungarribee Park dog park", kind: "off_leash_park", region: "hills_nw",
    area: "Western Sydney Parklands", address: "Doonside Rd, Doonside", lat: -33.782, lon: 150.871, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: BLACKTOWN, rules: [],
    features: { fenced: "full", parking: true },
    notes: ["Fenced off-leash area run by Western Sydney Parklands."],
  },
  {
    id: "alwyn-lindfield-reserve", name: "Alwyn Lindfield Reserve", kind: "off_leash_park", region: "hills_nw",
    area: "Blacktown City Council", address: "Glenwood Park Dr, Glenwood", lat: -33.734, lon: 150.927, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: official("Blacktown City Council: Alwyn Lindfield Reserve", "https://www.blacktown.nsw.gov.au/Sport-recreation/Parks-and-recreation-directory/Alwyn-Lindfield-Reserve"), rules: [],
    features: { fenced: "full" },
  },
  {
    id: "barnett-park", name: "Barnett Park dog area", kind: "off_leash_park", region: "hills_nw",
    area: "City of Parramatta", address: "Winston Hills", lat: -33.7787, lon: 150.9879, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: PARRAMATTA, rules: [],
    features: { fenced: "full" },
    notes: ["No dogs within 10 m of playgrounds."],
  },
  {
    id: "cumberland-state-forest", name: "Cumberland State Forest", kind: "state_forest", region: "hills_nw",
    area: "Forestry Corporation of NSW", address: "Castle Hill Rd, West Pennant Hills", lat: -33.742, lon: 151.035, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: official("Forestry Corporation: Cumberland State Forest", "https://www.forestrycorporation.com.au/visit/forests/cumberland-state-forest"), rules: [],
    features: { shade: true, toilets: true, parking: true },
    notes: ["Dogs must be on a lead at all times here (stricter than most state forests)."],
    hazards: ["Paralysis ticks are common in Sydney bushland. Check your dog after the walk."],
  },

  // ---------- Northern Beaches & North Shore ----------
  {
    id: "sirius-cove", name: "Sirius Cove Reserve", kind: "beach", region: "north",
    area: "Mosman Council", address: "Sirius Cove Rd, Mosman", lat: -33.8434, lon: 151.2437, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: LEASH_LAW,
    rules: [
      r({ status: "off_leash", days: [...WEEKDAYS], note: "Grass and water", source: MOSMAN }),
      r({ status: "off_leash", days: [...WEEKENDS_PH], window: { from: "16:00", to: "09:00" }, note: "Before 9am and after 4pm on weekends and public holidays", source: MOSMAN }),
    ],
    features: { swimming: true, water: true },
    notes: ["Dogs can swim off-leash in the same windows."],
  },
  {
    id: "spit-west", name: "Spit West Reserve", kind: "beach", region: "north",
    area: "Mosman Council", address: "Spit Rd, Mosman", lat: -33.803, lon: 151.244, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: LEASH_LAW,
    rules: [
      r({ status: "off_leash", days: [...WEEKDAYS], source: MOSMAN }),
      r({ status: "off_leash", days: [...WEEKENDS_PH], window: { from: "16:00", to: "09:00" }, source: MOSMAN }),
      r({ status: "on_lead", days: [6], window: { from: "08:30", to: "14:30" }, priority: 10, note: "Junior sport on Saturdays", source: MOSMAN }),
    ],
    features: { swimming: true },
  },
  {
    id: "clifton-gardens-east", name: "Clifton Gardens beach (east of the jetty)", kind: "beach", region: "north",
    area: "Mosman Council", address: "Morella Rd, Mosman", lat: -33.838, lon: 151.253, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: LEASH_LAW,
    rules: [
      r({ status: "off_leash", days: [...WEEKDAYS], season: "standard_time", window: { from: "16:00", to: "09:00" }, note: "Weekdays in winter: before 9am and after 4pm", source: MOSMAN }),
      r({ status: "off_leash", days: [...WEEKDAYS], season: "daylight_saving", window: { from: "18:00", to: "09:00" }, note: "Weekdays in daylight saving: before 9am and after 6pm", source: MOSMAN }),
    ],
    features: { swimming: true },
    notes: ["Only the beach and water east of the jetty.", "Council's page doesn't list weekend off-leash times here. Check the signs."],
  },
  {
    id: "flora-ritchie-roberts", name: "Flora and Ritchie Roberts Reserve", kind: "off_leash_park", region: "north",
    area: "Northern Beaches Council", address: "Curl Curl", lat: -33.771, lon: 151.2885, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: official("Northern Beaches Council: Flora and Ritchie Roberts Reserve", "https://www.northernbeaches.nsw.gov.au/things-to-do/recreation-area/flora-and-ritchie-roberts-reserve"),
    rules: [],
    features: { swimming: true },
    notes: ["Off-leash 24 hours in the reserve's off-leash area; dogs are allowed in Curl Curl Lagoon.", "Dogs are not allowed on Curl Curl Beach itself."],
  },
  {
    id: "mona-vale-south", name: "Mona Vale Beach (south) trial area", kind: "beach", region: "north",
    area: "Northern Beaches Council", address: "Mona Vale", lat: -33.682, lon: 151.307, approximateLocation: true,
    defaultStatus: "no_dogs", defaultSource: official("Northern Beaches Council: Mona Vale off-leash trial", "https://www.northernbeaches.nsw.gov.au/council/news/updated-dog-leash-hours-mona-vale-beach-south"),
    rules: [],
    features: { swimming: true },
    notes: ["The off-leash trial ran until 13 October 2026. We haven't seen a decision since, so treat it as closed to dogs until council confirms."],
  },
  {
    id: "berowra-valley-clarinda", name: "Berowra Valley Regional Park: Clarinda trail", kind: "regional_park", region: "north",
    area: "NSW National Parks (regional park)", address: "Clarinda St to Simon Pl, Hornsby", lat: -33.706, lon: 151.088, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: NPWS_DOGS, rules: [],
    features: { shade: true },
    notes: ["On-lead dogs only on the Clarinda, Bellamy and Daphne trail sections. Nowhere else in the park.", "The neighbouring Berowra Valley National Park doesn't allow dogs."],
    hazards: ["Paralysis ticks are common in Sydney bushland. Check your dog after the walk."],
  },
  {
    id: "lane-cove-np", name: "Lane Cove National Park", kind: "national_park", region: "north",
    area: "NSW National Parks", address: "Lady Game Dr, Chatswood West", lat: -33.79, lon: 151.15, approximateLocation: true,
    defaultStatus: "no_dogs", defaultSource: NPWS_DOGS, rules: [],
    features: { toilets: true, parking: true },
    notes: ["Dogs aren't allowed in NSW national parks, including car parks and picnic areas. Assistance animals excepted."],
  },

  // ---------- Eastern Suburbs & Inner West ----------
  {
    id: "rose-bay-foreshore", name: "Rose Bay foreshore", kind: "walk", region: "east_inner_west",
    area: "Woollahra Council", address: "Between Dumaresq Reserve and Percival Park, Rose Bay", lat: -33.87, lon: 151.27, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: official("Woollahra Council: Rose Bay Foreshore", "https://www.woollahra.nsw.gov.au/Recreation/List-of-Parks-Reserves-and-Playgrounds/Rose-Bay-Foreshore"),
    rules: [],
    features: { water: true },
  },
  {
    id: "dumaresq-reserve", name: "Dumaresq Reserve", kind: "off_leash_park", region: "east_inner_west",
    area: "Woollahra Council", address: "Rose Bay", lat: -33.8727, lon: 151.268, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: WOOLLAHRA,
    rules: [r({ status: "off_leash", window: { from: "15:30", to: "10:30" }, note: "3:30pm to 10:30am", source: WOOLLAHRA })],
    features: {},
    notes: ["An older council page says 4:30pm to 8:30am. The current walking-your-dog page says 3:30pm to 10:30am."],
  },
  {
    id: "marks-park", name: "Marks Park", kind: "off_leash_park", region: "east_inner_west",
    area: "Waverley Council", address: "Kenneth St, Tamarama", lat: -33.8985, lon: 151.27, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: WAVERLEY,
    rules: [r({ status: "off_leash", window: { from: "16:30", to: "08:30" }, note: "Not during Sculpture by the Sea", source: official("Waverley Council: Marks Park", "https://www.waverley.nsw.gov.au/recreation/parks_and_reserves/marks_park") })],
    features: {},
    notes: ["No dogs in the bushland or playground. Off-leash hours are suspended during Sculpture by the Sea."],
  },
  {
    id: "barracluff-park", name: "Barracluff Park", kind: "off_leash_park", region: "east_inner_west",
    area: "Waverley Council", address: "North Bondi", lat: -33.889, lon: 151.279, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: WAVERLEY,
    rules: [r({ status: "off_leash", window: { from: "15:00", to: "10:00" }, note: "Not on the sportsfield during organised sport or events", source: official("Waverley Council: Barracluff Park", "https://www.waverley.nsw.gov.au/recreation/parks_and_reserves/barracluff_park") })],
    features: {},
  },
  {
    id: "centennial-park", name: "Centennial Park off-leash areas", kind: "off_leash_park", region: "east_inner_west",
    area: "Greater Sydney Parklands", address: "Centennial Park", lat: -33.897, lon: 151.233, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: official("Centennial Parklands: Dogs in the Parklands", "https://www.centennialparklands.com.au/visit/plan-your-visit/regulation"),
    rules: [],
    features: { toilets: true, parking: true, water: true, shade: true },
    notes: ["Off-leash in designated areas away from Grand Drive and on sports fields when not in use.", "On lead near ponds, on roads and shared paths. No dogs within 10 m of playgrounds and BBQs."],
  },
  {
    id: "callan-point", name: "Callan Point beach (Callan Park)", kind: "beach", region: "east_inner_west",
    area: "Greater Sydney Parklands", address: "Callan Park, Rozelle", lat: -33.862, lon: 151.154, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: official("Greater Sydney Parklands: Callan Park companion animals plan", "https://www.greatersydneyparklands.nsw.gov.au/visit/callan-park/plan-your-visit-callan-park/companion-animals-management-plan"),
    rules: [r({ status: "off_leash", window: { from: "05:00", to: "22:00" }, source: official("Greater Sydney Parklands: Callan Park companion animals plan", "https://www.greatersydneyparklands.nsw.gov.au/visit/callan-park/plan-your-visit-callan-park/companion-animals-management-plan") })],
    features: { swimming: true },
    notes: ["All of Callan Park is on-lead from 10pm to 5am to protect wildlife.", "There are few signs at the beach itself."],
  },
  {
    id: "sydney-park", name: "Sydney Park", kind: "off_leash_park", region: "city",
    area: "City of Sydney", address: "Sydney Park Rd, St Peters", lat: -33.91, lon: 151.185, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: { ...official("City of Sydney: Sydney Park", "https://www.cityofsydney.nsw.gov.au/parks/sydney-park") },
    rules: [],
    features: { toilets: true, water: true, parking: true },
    notes: ["Off-leash except the wetlands, Alan Davidson Oval, cycling centre, playground and BBQ areas.", "Council's page may be old; check the signs."],
  },

  // ---------- South ----------
  {
    id: "greenhills-beach", name: "Greenhills Beach off-leash area", kind: "beach", region: "south",
    area: "Sutherland Shire Council", address: "Gate 5, Greenhills Beach, Cronulla", lat: -34.033, lon: 151.17, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: LEASH_LAW,
    rules: [
      r({ status: "off_leash", season: "daylight_saving", window: { from: "16:00", to: "10:00" }, source: official("Sutherland Shire Council: Greenhills Beach off-leash area", "https://sutherlandshire.nsw.gov.au/living-here/animals-and-pets/dog-parks/greenhills-beach-dog-off-leash-area,-cronulla") }),
      r({ status: "off_leash", season: "standard_time", window: { from: "15:00", to: "10:00" }, source: official("Sutherland Shire Council: Greenhills Beach off-leash area", "https://sutherlandshire.nsw.gov.au/living-here/animals-and-pets/dog-parks/greenhills-beach-dog-off-leash-area,-cronulla") }),
    ],
    features: { swimming: true, parking: true },
    notes: ["Enter at Gate 5. Dogs on lead going in and out."],
  },
  {
    id: "silver-beach-west", name: "Silver Beach (western end)", kind: "beach", region: "south",
    area: "Sutherland Shire Council", address: "Prince Charles Pde, Kurnell", lat: -34.005, lon: 151.2, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: guide("Shire Talk: Best dog walks in the Shire", "https://shiretalk.com.au/the-best-dog-walks-in-the-shire/"),
    rules: [],
    features: { swimming: true },
    notes: ["We haven't found an official council page for this one, only local guides. Confirm the signs and boundaries.", "No dogs on the rest of the beach."],
  },
  {
    id: "lady-robinsons-kyeemagh", name: "Lady Robinsons Beach off-leash area", kind: "beach", region: "south",
    area: "Bayside Council", address: "Between gates 60 and 61, Kyeemagh", lat: -33.948, lon: 151.164, approximateLocation: true,
    defaultStatus: "off_leash", defaultSource: official("Bayside Council: Off leash areas", "https://www.bayside.nsw.gov.au/services/pets-animals/leash-areas"),
    rules: [],
    features: { swimming: true },
    notes: ["24/7 between gates 60 and 61. Dogs aren't allowed anywhere else on the beach, even on lead."],
  },

  // ---------- Day trips (from the Mt Wilson day out) ----------
  {
    id: "windyridge-garden", name: "Windyridge Garden", kind: "garden", region: "regional",
    area: "Private garden, Mount Wilson", address: "25 Queens Ave, Mount Wilson", lat: -33.5115, lon: 150.3765, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: official("Windyridge Garden: FAQs", "https://www.windyridgegarden.com/faqs"), rules: [],
    features: { toilets: true },
    notes: ["Dogs welcome on lead if socially trained. About $12.50 adult; open daily from 8am.", "Sloping garden; easier paths to the lookout and toilets."],
  },
  {
    id: "hillbilly-cider", name: "Hillbilly Cider Shed", kind: "cafe", region: "regional",
    area: "Bilpin", address: "2230 Bells Line of Rd, Bilpin", lat: -33.502, lon: 150.553, approximateLocation: true,
    defaultStatus: "on_lead", defaultSource: LEASH_LAW, rules: [],
    features: { toilets: true, parking: true },
    notes: ["Dogs welcome on the lawn. Open 10am–6pm weekends; book ahead on (02) 4567 0965."],
  },
  {
    id: "bellbird-lookout", name: "Bellbird Lookout", kind: "lookout", region: "regional",
    area: "Bells Line of Road, Kurrajong Heights", address: "1183 Bells Line of Rd, Kurrajong Heights", lat: -33.5367, lon: 150.6333,
    defaultStatus: "on_lead", defaultSource: LEASH_LAW, rules: [],
    features: { toilets: true, parking: true },
    notes: ["Only turn in when heading downhill (east)."],
  },
];
