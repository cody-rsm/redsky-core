// Illustrative sample records from the approved prototype (prototype/data/sample-data.json), generated
// mechanically. Every person, company, figure and news item here is fictional demo content. Served ONLY
// by the demo data provider (REDSKY_DATA_MODE=demo); production code paths must never import this file.
import type {
  DemoAiRecommendation,
  DemoApproval,
  DemoAttentionItem,
  DemoDeal,
  DemoDocument,
  DemoGovItem,
  DemoIntelItem,
  DemoMeeting,
  DemoNotification,
  DemoPerson,
  DemoPortfolioItem,
  DemoPrep,
  DemoProject,
  DemoStageStat,
  DemoTeamActivity,
  DemoWorkstyleProfile,
  DemoPersonaId,
} from './types';

export const DEMO_PEOPLE: Record<string, DemoPerson> = {
  "c1": {
    "name": "Priya Raman",
    "title": "VP, Strategic Partnerships",
    "org": "Ridgeline Grid Storage",
    "owner": "Tom Becker",
    "strength": "Strong",
    "tone": 3,
    "last": "Oct 9 · Call — interconnection timeline",
    "fact": "Asked for a revised term outline before the next meeting.",
    "suggest": "Send the revised outline before 9:30 and confirm LOI owners in the meeting.",
    "act": [
      {
        "d": "Oct 9",
        "t": "Call — walked through the revised interconnection timeline (Tom Becker)"
      },
      {
        "d": "Sep 18",
        "t": "Site visit — Gulf Coast facility"
      },
      {
        "d": "Aug 27",
        "t": "NDA executed"
      }
    ]
  },
  "c2": {
    "name": "Daniel Okafor",
    "title": "Senior Policy Advisor",
    "org": "State Office of Energy Policy (sample)",
    "owner": "@ga",
    "strength": "Warm",
    "tone": 4,
    "gov": true,
    "last": "Sep 30 · Meeting — permitting briefing",
    "fact": "Meeting today at 11:00 AM; asked in September for site-level permitting data.",
    "suggest": "Bring RSM's site-level permitting-delay data he asked about.",
    "act": [
      {
        "d": "Sep 30",
        "t": "Meeting — permitting reform briefing"
      },
      {
        "d": "Sep 12",
        "t": "Email — shared coalition principles"
      },
      {
        "d": "Jul 22",
        "t": "Event — energy policy roundtable"
      }
    ]
  },
  "c3": {
    "name": "Dana Kim",
    "title": "CEO",
    "org": "Halcyon Robotics",
    "owner": "Marcus Chen",
    "strength": "New",
    "tone": 2,
    "last": "Oct 12 · Intro email via Jordan Alvarez",
    "fact": "New relationship, introduced by Jordan Alvarez. Term sheet expected Nov 14.",
    "suggest": "After today's intro, send the data-room request and a short RSM overview.",
    "act": [
      {
        "d": "Oct 14",
        "t": "Series B deck received via email capture"
      },
      {
        "d": "Oct 12",
        "t": "Introduced by Jordan Alvarez (Brightline Ventures)"
      }
    ]
  },
  "c4": {
    "name": "Jordan Alvarez",
    "title": "Partner",
    "org": "Brightline Ventures",
    "owner": "Marcus Chen",
    "strength": "Strong",
    "tone": 0,
    "last": "Oct 12 · Email — Halcyon introduction",
    "fact": "Introduced Halcyon Robotics on Oct 12.",
    "suggest": "Thank Jordan after today's 2:30 intro and share next steps.",
    "act": [
      {
        "d": "Oct 12",
        "t": "Email — introduced Dana Kim, Halcyon Robotics"
      },
      {
        "d": "Aug 4",
        "t": "Lunch — co-investment pipeline"
      }
    ]
  },
  "c5": {
    "name": "Elena Sorensen",
    "title": "Director of Public Affairs",
    "org": "Atlas Transmission Co.",
    "owner": "@ga",
    "strength": "Cooling",
    "tone": 1,
    "last": "Sep 24 · Coffee — coalition strategy",
    "fact": "Promised permitting comments on Sep 24 — not yet sent.",
    "suggest": "Send the comments and propose a call before Thursday's markup.",
    "act": [
      {
        "d": "Sep 24",
        "t": "Coffee — coalition strategy; RSM to send permitting comments"
      },
      {
        "d": "Aug 19",
        "t": "Email — coalition membership"
      }
    ]
  },
  "c6": {
    "name": "Raymond Hsu",
    "title": "Managing Director",
    "org": "Keystone Infrastructure Partners",
    "owner": "Eleanor Vance",
    "strength": "Warm",
    "tone": 5,
    "last": "Aug 30 · Email — co-investment terms",
    "fact": "Co-investor on Ridgeline; no contact in 50 days.",
    "suggest": "Re-engage before the Ridgeline IC on Oct 28 — ask about their allocation.",
    "act": [
      {
        "d": "Aug 30",
        "t": "Email — Ridgeline co-investment terms"
      },
      {
        "d": "Jul 11",
        "t": "Dinner — infrastructure outlook"
      }
    ]
  },
  "c7": {
    "name": "Tom Becker",
    "title": "VP, Energy & Infrastructure",
    "org": "RSM Capital",
    "internal": true,
    "tone": 3
  },
  "c8": {
    "name": "Aisha Patel",
    "title": "Associate, Energy & Infrastructure",
    "org": "RSM Capital",
    "internal": true,
    "tone": 2
  },
  "c9": {
    "name": "Sofia Marquez",
    "title": "Chief of Staff",
    "org": "RSM Capital",
    "internal": true,
    "tone": 4
  },
  "c10": {
    "name": "Hannah Brooks",
    "title": "Analyst, Investments",
    "org": "RSM Capital",
    "internal": true,
    "tone": 5
  },
  "c11": {
    "name": "Victor Lang",
    "title": "CFO",
    "org": "Tessellate Energy",
    "owner": "Marcus Chen",
    "strength": "Warm",
    "tone": 3,
    "last": "Oct 16 · Email — updated financial model",
    "fact": "Sent an updated model on Oct 16; three questions outstanding.",
    "suggest": "Send the three model questions from the memo review before Friday.",
    "act": [
      {
        "d": "Oct 16",
        "t": "Email — updated financial model"
      }
    ]
  },
  "c12": {
    "name": "Natalie Ford",
    "title": "General Partner",
    "org": "Cobalt Peak Capital",
    "owner": "Eleanor Vance",
    "strength": "Strong",
    "tone": 0,
    "last": "Sep 15 · Dinner — co-investment pipeline",
    "fact": "Co-led two prior deals with RSM.",
    "suggest": "Share the Q3 portfolio letter when final and invite her to the LP meeting.",
    "act": [
      {
        "d": "Sep 15",
        "t": "Dinner — co-investment pipeline"
      }
    ]
  },
  "c13": {
    "name": "Marcus Chen",
    "title": "Principal, Venture Investments",
    "org": "RSM Capital",
    "internal": true,
    "tone": 4
  },
  "c14": {
    "name": "Eleanor Vance",
    "title": "Managing Partner",
    "org": "RSM Capital",
    "internal": true,
    "tone": 0
  }
};

export const DEMO_RECON: Record<DemoPersonaId, string[]> = {
  "ga": [
    "c5",
    "c6",
    "c4",
    "c2"
  ],
  "exec": [
    "c6",
    "c12",
    "c4",
    "c1"
  ],
  "vc": [
    "c4",
    "c11",
    "c12",
    "c3"
  ]
};

export const DEMO_DEALS: Record<string, DemoDeal> = {
  "d1": {
    "name": "Halcyon Robotics",
    "round": "Series B",
    "amount": "$12.0M",
    "stage": 1,
    "lead": "Marcus Chen",
    "sector": "Industrial robotics",
    "activity": "Intro call today, 2:30 PM",
    "change": "Added → Initial Review"
  },
  "d2": {
    "name": "Ridgeline Grid Storage",
    "round": "Growth equity",
    "amount": "$18.0M",
    "stage": 3,
    "lead": "Tom Becker",
    "sector": "Energy storage",
    "activity": "IC scheduled Oct 28",
    "change": "Diligence → IC"
  },
  "d3": {
    "name": "Corvid Analytics",
    "round": "Series A",
    "amount": "$6.0M",
    "stage": 2,
    "lead": "Hannah Brooks",
    "sector": "Industrial software",
    "activity": "4 of 6 customer references complete",
    "change": "Review → Diligence"
  },
  "d4": {
    "name": "Tessellate Energy",
    "round": "Seed",
    "amount": "$3.0M",
    "stage": 1,
    "lead": "Hannah Brooks",
    "sector": "Grid software",
    "activity": "Investment memo uploaded Oct 17",
    "change": "Memo uploaded"
  },
  "d5": {
    "name": "Meridian Water Systems",
    "round": "Series A",
    "amount": "$8.0M",
    "stage": 4,
    "lead": "Marcus Chen",
    "sector": "Water infrastructure",
    "activity": "Term sheet redlines returned Oct 16",
    "change": "Redlines returned"
  },
  "d6": {
    "name": "Lumen Freight",
    "round": "Seed",
    "amount": "$2.5M",
    "stage": 0,
    "lead": "Marcus Chen",
    "sector": "Logistics",
    "activity": "Flagged by sourcing signal (sample)",
    "change": "New"
  },
  "d7": {
    "name": "Quarry Labs",
    "round": "Series A",
    "amount": "$5.0M",
    "stage": 0,
    "lead": "Hannah Brooks",
    "sector": "Materials",
    "activity": "Intro requested via Brightline",
    "change": "New"
  },
  "d8": {
    "name": "Orchard Health",
    "round": "Series A",
    "amount": "$7.0M",
    "stage": 5,
    "lead": "Hannah Brooks",
    "sector": "Digital health",
    "activity": "Closed in Q2; in portfolio",
    "change": "—"
  }
};

export const DEMO_STAGE_STATS: DemoStageStat[] = [
  {
    "count": 14,
    "value": "$86M",
    "delta": "+3",
    "dir": "up"
  },
  {
    "count": 9,
    "value": "$61M",
    "delta": "+1",
    "dir": "up"
  },
  {
    "count": 5,
    "value": "$42M",
    "delta": "+1",
    "dir": "up"
  },
  {
    "count": 2,
    "value": "$26M",
    "delta": "+1",
    "dir": "up"
  },
  {
    "count": 2,
    "value": "$15M",
    "delta": "0",
    "dir": "flat"
  },
  {
    "count": 23,
    "value": "Portfolio",
    "delta": "0",
    "dir": "flat"
  }
];

export const DEMO_PROJECTS: Record<string, DemoProject> = {
  "p1": {
    "name": "Gulf Coast Storage Partnership",
    "kind": "External · Business development",
    "status": "On track",
    "tone": "ok",
    "owner": "Tom Becker",
    "ownerTone": 3,
    "activity": "Priya Raman shared a revised interconnection timeline · 2d ago",
    "milestone": "LOI draft",
    "mdate": "Oct 30",
    "tasks": 2,
    "pct": 55,
    "pids": [
      "ga",
      "exec"
    ]
  },
  "p2": {
    "name": "Grid Permitting Reform Coalition",
    "kind": "Government affairs",
    "status": "At risk",
    "tone": "ac",
    "owner": "@ga",
    "ownerTone": 1,
    "activity": "Committee markup moved up to Thu, Oct 22 · today",
    "milestone": "Stakeholder memo",
    "mdate": "Oct 21",
    "tasks": 3,
    "pct": 40,
    "pids": [
      "ga",
      "exec"
    ]
  },
  "p3": {
    "name": "Lone Star Microgrid Site Selection",
    "kind": "Energy & infrastructure",
    "status": "On track",
    "tone": "ok",
    "owner": "Aisha Patel",
    "ownerTone": 2,
    "activity": "Two sites cleared the environmental screen · 4d ago",
    "milestone": "Site shortlist",
    "mdate": "Nov 6",
    "tasks": 1,
    "pct": 30,
    "pids": [
      "ga",
      "exec"
    ]
  },
  "p4": {
    "name": "RedSky Phase 1 Rollout",
    "kind": "Internal initiative",
    "status": "On track",
    "tone": "ok",
    "owner": "Sofia Marquez",
    "ownerTone": 4,
    "activity": "Email-capture pilot live for six users · 1d ago",
    "milestone": "Connected CRM pilot",
    "mdate": "Nov 15",
    "tasks": 1,
    "pct": 65,
    "pids": [
      "ga",
      "exec",
      "vc"
    ]
  },
  "p5": {
    "name": "Halcyon Robotics Diligence",
    "kind": "Investment",
    "status": "Starting",
    "tone": "n",
    "owner": "Marcus Chen",
    "ownerTone": 4,
    "activity": "Data room access requested · 1d ago",
    "milestone": "IC memo draft",
    "mdate": "Nov 9",
    "tasks": 4,
    "pct": 10,
    "pids": [
      "vc"
    ]
  },
  "p6": {
    "name": "Annual LP Meeting 2026",
    "kind": "Internal initiative",
    "status": "Needs decision",
    "tone": "wn",
    "owner": "Sofia Marquez",
    "ownerTone": 4,
    "activity": "Venue contract awaiting approval · 3d ago",
    "milestone": "Agenda final",
    "mdate": "Nov 2",
    "tasks": 2,
    "pct": 45,
    "pids": [
      "exec"
    ]
  },
  "p7": {
    "name": "Climate Infrastructure Thesis Refresh",
    "kind": "Research",
    "status": "On track",
    "tone": "ok",
    "owner": "Hannah Brooks",
    "ownerTone": 5,
    "activity": "Research pack added from AlphaSense (sample) · 3d ago",
    "milestone": "Draft thesis",
    "mdate": "Nov 12",
    "tasks": 1,
    "pct": 35,
    "pids": [
      "vc"
    ]
  }
};

export const DEMO_DOCS: Record<string, DemoDocument> = {
  "doc1": {
    "name": "Ridgeline — Partnership term outline v3",
    "kind": "Word",
    "meta": "SharePoint · edited by Tom Becker · Oct 15",
    "pids": [
      "ga",
      "exec"
    ]
  },
  "doc2": {
    "name": "Stakeholder memo — permitting reform (draft)",
    "kind": "Word",
    "meta": "OneDrive · edited by you · Oct 16",
    "pids": [
      "ga"
    ]
  },
  "doc3": {
    "name": "Halcyon Robotics — Series B deck",
    "kind": "PDF",
    "meta": "Email capture · Oct 14",
    "pids": [
      "ga",
      "vc"
    ]
  },
  "doc4": {
    "name": "Tessellate Energy — Seed investment memo",
    "kind": "Word",
    "meta": "SharePoint · Hannah Brooks · Oct 17",
    "pids": [
      "vc",
      "exec"
    ]
  },
  "doc5": {
    "name": "Lone Star — site-selection memo",
    "kind": "Word",
    "meta": "SharePoint · Aisha Patel · Oct 16",
    "pids": [
      "ga"
    ]
  },
  "doc6": {
    "name": "Q3 portfolio letter (final draft)",
    "kind": "Word",
    "meta": "SharePoint · Hannah Brooks · Oct 18",
    "pids": [
      "exec",
      "vc"
    ]
  },
  "doc7": {
    "name": "Gulf Coast interconnection study (summary)",
    "kind": "PDF",
    "meta": "SharePoint · Oct 9",
    "pids": []
  },
  "doc8": {
    "name": "Ridgeline IC pre-read (draft)",
    "kind": "Word",
    "meta": "SharePoint · Tom Becker · Oct 17",
    "pids": [
      "exec",
      "vc"
    ]
  },
  "doc9": {
    "name": "Coalition principles v2",
    "kind": "Word",
    "meta": "SharePoint · Sep 12",
    "pids": []
  },
  "doc10": {
    "name": "Brightline introduction note",
    "kind": "Email",
    "meta": "Email capture · Oct 12",
    "pids": []
  }
};

export const DEMO_MEET: Record<string, DemoMeeting> = {
  "m1": {
    "time": "9:30 AM",
    "start": 570,
    "dur": "45 min",
    "title": "Ridgeline × RSM — Interconnection partnership",
    "org": "Ridgeline Grid Storage",
    "people": [
      "c1",
      "c7"
    ],
    "rk": "project",
    "rid": "p1",
    "related": "Gulf Coast Storage Partnership",
    "prep": "Brief ready",
    "prepTone": "ok",
    "where": "Microsoft Teams"
  },
  "m2": {
    "time": "11:00 AM",
    "start": 660,
    "dur": "30 min",
    "title": "Permitting reform check-in",
    "org": "State Office of Energy Policy (sample)",
    "people": [
      "c2"
    ],
    "rk": "project",
    "rid": "p2",
    "related": "Grid Permitting Reform Coalition",
    "prep": "Needs prep",
    "prepTone": "wn",
    "where": "Phone",
    "gov": true
  },
  "m3": {
    "time": "2:30 PM",
    "start": 870,
    "dur": "45 min",
    "title": "Halcyon Robotics — Series B introduction",
    "org": "Halcyon Robotics",
    "people": [
      "c3",
      "c4",
      "c13"
    ],
    "rk": "deal",
    "rid": "d1",
    "related": "Halcyon Robotics · Series B",
    "prep": "Not started",
    "prepTone": "n",
    "where": "Microsoft Teams"
  },
  "m4": {
    "time": "4:00 PM",
    "start": 960,
    "dur": "45 min",
    "title": "Weekly BD & policy pipeline review",
    "org": "RSM Capital · Internal",
    "people": [
      "c7",
      "c8",
      "c9"
    ],
    "rk": null,
    "related": "",
    "prep": "Agenda shared",
    "prepTone": "ok",
    "where": "Conference room"
  },
  "m5": {
    "time": "11:30 AM",
    "start": 690,
    "dur": "60 min",
    "title": "Partners' weekly meeting",
    "org": "RSM Capital · Internal",
    "people": [
      "c9",
      "c7",
      "c13"
    ],
    "rk": null,
    "related": "",
    "prep": "Agenda shared",
    "prepTone": "ok",
    "where": "Board room"
  },
  "m6": {
    "time": "1:00 PM",
    "start": 780,
    "dur": "30 min",
    "title": "Keystone Infrastructure — co-investment catch-up",
    "org": "Keystone Infrastructure Partners",
    "people": [
      "c6"
    ],
    "rk": "deal",
    "rid": "d2",
    "related": "Ridgeline Grid Storage · Growth",
    "prep": "Brief ready",
    "prepTone": "ok",
    "where": "Phone"
  },
  "m7": {
    "time": "10:00 AM",
    "start": 600,
    "dur": "45 min",
    "title": "Corvid Analytics — customer reference call",
    "org": "Corvid Analytics",
    "people": [
      "c10"
    ],
    "rk": "deal",
    "rid": "d3",
    "related": "Corvid Analytics · Series A",
    "prep": "Needs prep",
    "prepTone": "wn",
    "where": "Microsoft Teams"
  },
  "m8": {
    "time": "3:30 PM",
    "start": 930,
    "dur": "60 min",
    "title": "IC pre-read review: Ridgeline Grid Storage",
    "org": "RSM Capital · Internal",
    "people": [
      "c7",
      "c14",
      "c10"
    ],
    "rk": "deal",
    "rid": "d2",
    "related": "Ridgeline Grid Storage · Growth",
    "prep": "Pre-read draft",
    "prepTone": "wn",
    "where": "Board room"
  }
};

export const DEMO_MEET_BY: Record<DemoPersonaId, string[]> = {
  "ga": [
    "m1",
    "m2",
    "m3",
    "m4"
  ],
  "exec": [
    "m1",
    "m5",
    "m6",
    "m3"
  ],
  "vc": [
    "m7",
    "m3",
    "m8"
  ]
};

export const DEMO_PREP: Record<string, DemoPrep> = {
  "m1": {
    "summary": "Ridgeline wants to move from term outline to LOI by Oct 30. The open question is the revised interconnection date, which could shift the schedule. Priya is waiting on RSM's revised outline, and Tom owes her permitting-coalition contacts.",
    "history": [
      {
        "d": "Oct 9",
        "t": "Call — Priya walked through the revised interconnection timeline",
        "by": "Logged by Tom Becker"
      },
      {
        "d": "Sep 18",
        "t": "Site visit — Gulf Coast facility",
        "by": "Logged by Tom Becker"
      },
      {
        "d": "Aug 27",
        "t": "Mutual NDA executed",
        "by": "Legal"
      }
    ],
    "docs": [
      "doc1",
      "doc7",
      "doc8"
    ],
    "dev": [
      "Regional grid operator reports a growing interconnection backlog (illustrative).",
      "Ridgeline named a new COO in September (illustrative)."
    ],
    "topics": [
      "Confirm the revised interconnection date and what it means for the Oct 30 LOI.",
      "Clarify whether Ridgeline sees RSM's role as capital, strategic, or both.",
      "Agree owners and dates for the LOI draft."
    ],
    "followups": [
      {
        "t": "Send revised partnership term outline",
        "who": "@me",
        "due": "Today",
        "tone": "ac"
      },
      {
        "t": "Share permitting-coalition contacts with Priya",
        "who": "Tom Becker",
        "due": "3 days overdue",
        "tone": "ac"
      }
    ]
  },
  "m2": {
    "summary": "Daniel's office is drafting amendments ahead of Thursday's committee markup. In September he asked for RSM's data on site-level permitting delays; bringing it today would strengthen the coalition's position.",
    "history": [
      {
        "d": "Sep 30",
        "t": "Meeting — permitting reform briefing",
        "by": "Logged by you"
      },
      {
        "d": "Sep 12",
        "t": "Email — shared coalition principles",
        "by": "Email capture"
      },
      {
        "d": "Jul 22",
        "t": "Event — energy policy roundtable",
        "by": "Logged by you"
      }
    ],
    "docs": [
      "doc9",
      "doc2"
    ],
    "dev": [
      "Committee markup moved up to Thursday, Oct 22 (illustrative).",
      "Two coalition members filed public comments this week (illustrative)."
    ],
    "topics": [
      "Ask which provisions are still open before markup.",
      "Offer RSM's site-level data on permitting delays.",
      "Confirm the right staff contact for follow-up after Thursday."
    ],
    "followups": [
      {
        "t": "Send updated stakeholder memo",
        "who": "@me",
        "due": "Oct 21",
        "tone": "wn"
      }
    ]
  },
  "m3": {
    "summary": "First meeting with Halcyon Robotics. Dana Kim is raising a Series B with a term sheet expected Nov 14. Jordan Alvarez (Brightline Ventures) made the introduction and will join. The deck arrived Oct 14 through email capture.",
    "history": [
      {
        "d": "Oct 14",
        "t": "Series B deck received via email capture",
        "by": "Matched automatically · confirmed by Marcus Chen"
      },
      {
        "d": "Oct 12",
        "t": "Email — Jordan Alvarez introduced Dana Kim",
        "by": "Email capture"
      }
    ],
    "docs": [
      "doc3",
      "doc10"
    ],
    "dev": [
      "A competitor announced a Series C last week (illustrative).",
      "Term sheet expected Nov 14, per the introduction email."
    ],
    "topics": [
      "Use of proceeds and timeline to term sheet.",
      "Unit economics of deployments to date.",
      "Where RSM's energy and infrastructure network could help."
    ],
    "followups": [
      {
        "t": "Thank Jordan Alvarez for the introduction",
        "who": "Marcus Chen",
        "due": "Oct 20",
        "tone": "tx"
      },
      {
        "t": "Request data room access",
        "who": "Marcus Chen",
        "due": "Oct 20",
        "tone": "tx"
      }
    ]
  }
};

export const DEMO_ATT: DemoAttentionItem[] = [
  {
    "id": "a1",
    "pids": [
      "ga"
    ],
    "p": "high",
    "type": "Follow-up",
    "typeIcon": "mail",
    "title": "Send revised partnership term outline to Priya Raman",
    "related": "Ridgeline Grid Storage",
    "rk": "contact",
    "rid": "c1",
    "due": "Today",
    "dueTone": "ac",
    "act": "draft",
    "actLabel": "Draft with AI",
    "source": "Surfaced from Oct 9 call notes"
  },
  {
    "id": "a2",
    "pids": [
      "ga",
      "exec"
    ],
    "p": "high",
    "type": "Government affairs",
    "typeIcon": "capitol",
    "title": "Update stakeholder memo — committee markup moved to Thursday",
    "related": "Grid Permitting Reform Coalition",
    "rk": "project",
    "rid": "p2",
    "due": "Tomorrow",
    "dueTone": "wn",
    "act": "open",
    "actLabel": "Open project",
    "source": "Change detected in legislative tracking"
  },
  {
    "id": "a3",
    "pids": [
      "ga"
    ],
    "p": "med",
    "type": "Relationship",
    "typeIcon": "people",
    "title": "Send the permitting comments promised to Elena Sorensen",
    "related": "Elena Sorensen",
    "rk": "contact",
    "rid": "c5",
    "due": "4 days overdue",
    "dueTone": "ac",
    "act": "draft",
    "actLabel": "Draft with AI",
    "source": "Commitment recorded Sep 24"
  },
  {
    "id": "a4",
    "pids": [
      "ga",
      "vc",
      "exec"
    ],
    "p": "med",
    "type": "Meeting prep",
    "typeIcon": "calendar",
    "title": "Prepare for the Halcyon Robotics Series B introduction",
    "related": "Halcyon Robotics",
    "rk": "deal",
    "rid": "d1",
    "due": "Today · 2:30 PM",
    "dueTone": "tx",
    "act": "prep",
    "mid": "m3",
    "actLabel": "Prepare",
    "source": ""
  },
  {
    "id": "a5",
    "pids": [
      "ga"
    ],
    "p": "low",
    "type": "Request",
    "typeIcon": "chat",
    "title": "Comment on the Lone Star site-selection memo for Tom Becker",
    "related": "Lone Star Microgrid Site Selection",
    "rk": "project",
    "rid": "p3",
    "due": "Oct 21",
    "dueTone": "tx",
    "act": "open",
    "actLabel": "Open request",
    "source": ""
  },
  {
    "id": "a6",
    "pids": [
      "vc"
    ],
    "p": "high",
    "type": "Diligence",
    "typeIcon": "diligence",
    "title": "Review customer reference summaries (4 of 6 complete)",
    "related": "Corvid Analytics",
    "rk": "deal",
    "rid": "d3",
    "due": "Today",
    "dueTone": "ac",
    "act": "open",
    "actLabel": "Review",
    "source": ""
  },
  {
    "id": "a7",
    "pids": [
      "vc",
      "exec"
    ],
    "p": "med",
    "type": "Document",
    "typeIcon": "doc",
    "title": "Review the newly uploaded seed investment memo",
    "related": "Tessellate Energy",
    "rk": "doc",
    "rid": "doc4",
    "due": "Oct 23",
    "dueTone": "tx",
    "act": "summarize",
    "actLabel": "Summarize with AI",
    "source": "Uploaded Oct 17 by Hannah Brooks"
  },
  {
    "id": "a8",
    "pids": [
      "vc"
    ],
    "p": "med",
    "type": "Negotiation",
    "typeIcon": "edit",
    "title": "Respond to term sheet redlines",
    "related": "Meridian Water Systems",
    "rk": "deal",
    "rid": "d5",
    "due": "Tomorrow",
    "dueTone": "wn",
    "act": "open",
    "actLabel": "Open deal",
    "source": ""
  },
  {
    "id": "a9",
    "pids": [
      "exec"
    ],
    "p": "high",
    "type": "Approval",
    "typeIcon": "diligence",
    "title": "Approve IC date and pre-read distribution",
    "related": "Ridgeline Grid Storage",
    "rk": "deal",
    "rid": "d2",
    "due": "Today",
    "dueTone": "ac",
    "act": "approve",
    "apId": "ap1",
    "actLabel": "Approve",
    "source": "Requested by Tom Becker"
  },
  {
    "id": "a10",
    "pids": [
      "vc",
      "exec"
    ],
    "p": "low",
    "type": "Follow-up",
    "typeIcon": "mail",
    "title": "Thank Jordan Alvarez for the Halcyon introduction",
    "related": "Jordan Alvarez",
    "rk": "contact",
    "rid": "c4",
    "due": "Oct 20",
    "dueTone": "tx",
    "act": "draft",
    "actLabel": "Draft with AI",
    "source": "Suggested after the intro email"
  }
];

export const DEMO_APPROVALS: DemoApproval[] = [
  {
    "id": "ap1",
    "title": "Ridgeline Growth — IC date and pre-read distribution",
    "by": "Tom Becker",
    "due": "Today",
    "dueTone": "ac",
    "rk": "deal",
    "rid": "d2"
  },
  {
    "id": "ap2",
    "title": "Annual LP Meeting — venue contract",
    "by": "Sofia Marquez",
    "due": "Oct 21",
    "dueTone": "wn",
    "rk": "project",
    "rid": "p6"
  },
  {
    "id": "ap3",
    "title": "Q3 portfolio letter — final draft",
    "by": "Hannah Brooks",
    "due": "Oct 23",
    "dueTone": "tx",
    "rk": "doc",
    "rid": "doc6"
  }
];

export const DEMO_GOV: DemoGovItem[] = [
  {
    "id": "g1",
    "title": "Grid Permitting Reform Act (illustrative)",
    "juris": "Federal · Senate committee",
    "position": "Support with amendments",
    "cur": 2,
    "change": "Markup moved up 7 days",
    "chipCls": "chip-ac",
    "next": "Committee markup · Thu, Oct 22",
    "rk": "project",
    "rid": "p2"
  },
  {
    "id": "g2",
    "title": "Microgrid tariff proceeding (illustrative)",
    "juris": "State utility commission",
    "position": "Monitoring",
    "cur": 1,
    "change": "Comment period open",
    "chipCls": "chip-wn",
    "next": "Comments close · Nov 13",
    "rk": "project",
    "rid": "p3"
  },
  {
    "id": "g3",
    "title": "Clean hydrogen credit guidance (illustrative)",
    "juris": "Federal agency guidance",
    "position": "Monitoring",
    "cur": 1,
    "change": "No change this week",
    "chipCls": "",
    "next": "Guidance expected · Q4",
    "rk": null
  }
];

export const DEMO_INTEL: DemoIntelItem[] = [
  {
    "id": "i1",
    "pids": [
      "ga",
      "exec"
    ],
    "headline": "Committee schedules markup on transmission permitting bill",
    "source": "LegiStorm (sample)",
    "date": "Oct 19",
    "topic": "Grid Permitting Reform",
    "why": "Your stakeholder memo is now due a week earlier — before Thursday.",
    "rk": "project",
    "rid": "p2"
  },
  {
    "id": "i2",
    "pids": [
      "ga",
      "exec",
      "vc"
    ],
    "headline": "Interconnection queue backlog grows across the region",
    "source": "Industry research (sample)",
    "date": "Oct 18",
    "topic": "Ridgeline Grid Storage",
    "why": "May shift the LOI timeline you'll discuss at 9:30.",
    "rk": "deal",
    "rid": "d2"
  },
  {
    "id": "i3",
    "pids": [
      "vc",
      "ga"
    ],
    "headline": "Robotics competitor announces a Series C round",
    "source": "Harmonic (sample)",
    "date": "Oct 17",
    "topic": "Halcyon Robotics",
    "why": "Useful context for valuation questions in today's 2:30 intro.",
    "rk": "deal",
    "rid": "d1"
  },
  {
    "id": "i4",
    "pids": [
      "ga"
    ],
    "headline": "Utility commission opens comment period on microgrid tariffs",
    "source": "State regulator (sample)",
    "date": "Oct 16",
    "topic": "Lone Star Microgrid",
    "why": "Comments close Nov 13 and affect site economics on your shortlist.",
    "rk": "project",
    "rid": "p3"
  },
  {
    "id": "i5",
    "pids": [
      "vc",
      "exec"
    ],
    "headline": "Municipal water infrastructure funding round-up",
    "source": "AlphaSense (sample)",
    "date": "Oct 15",
    "topic": "Meridian Water Systems",
    "why": "Supports the demand case in the Meridian investment memo.",
    "rk": "deal",
    "rid": "d5"
  },
  {
    "id": "i6",
    "pids": [
      "exec",
      "vc"
    ],
    "headline": "Family offices increase direct infrastructure allocations",
    "source": "Research (sample)",
    "date": "Oct 14",
    "topic": "Firm strategy",
    "why": "Relevant to positioning in the Q3 letter and the LP meeting agenda.",
    "rk": "doc",
    "rid": "doc6"
  }
];

export const DEMO_PORTFOLIO: DemoPortfolioItem[] = [
  {
    "name": "Northline Batteries",
    "sector": "Energy storage",
    "update": "Q3 revenue update posted",
    "status": "On plan",
    "tone": "ok",
    "owner": "Marcus Chen"
  },
  {
    "name": "Kestrel Bio",
    "sector": "Life sciences",
    "update": "Board meeting Oct 27; pre-read pending",
    "status": "Watch",
    "tone": "wn",
    "owner": "Eleanor Vance"
  },
  {
    "name": "Parcel Labs",
    "sector": "Logistics software",
    "update": "Exploring bridge financing",
    "status": "At risk",
    "tone": "ac",
    "owner": "Marcus Chen"
  },
  {
    "name": "Orchard Health",
    "sector": "Digital health",
    "update": "Hired a new CFO",
    "status": "On plan",
    "tone": "ok",
    "owner": "Hannah Brooks"
  },
  {
    "name": "Ferro Systems",
    "sector": "Industrial IoT",
    "update": "Pilot expansion with two utilities",
    "status": "On plan",
    "tone": "ok",
    "owner": "Hannah Brooks"
  }
];

export const DEMO_RECS: Record<DemoPersonaId, DemoAiRecommendation[]> = {
  "ga": [
    {
      "id": "r1",
      "text": "Bundle your two Ridgeline follow-ups into one note before 9:30.",
      "basis": "Oct 9 call notes · 2 open follow-ups",
      "actLabel": "Draft note",
      "kind": "draft",
      "ref": "a1"
    },
    {
      "id": "r2",
      "text": "Elena Sorensen has been waiting 25 days for the comments you promised.",
      "basis": "Commitment recorded Sep 24",
      "actLabel": "Draft note",
      "kind": "draft",
      "ref": "a3"
    },
    {
      "id": "r3",
      "text": "Thursday's markup overlaps the Lone Star site review. Consider moving the review to Wednesday.",
      "basis": "Your calendar · Grid Permitting Reform",
      "actLabel": "Propose new time",
      "kind": "propose"
    }
  ],
  "exec": [
    {
      "id": "r4",
      "text": "The Ridgeline IC on Oct 28 has no pre-read owner assigned.",
      "basis": "IC calendar · deal team roster",
      "actLabel": "Assign owner",
      "kind": "tasks",
      "tasks": [
        {
          "title": "Assign Ridgeline IC pre-read owner",
          "related": "Ridgeline Grid Storage",
          "due": "Oct 21"
        }
      ]
    },
    {
      "id": "r5",
      "text": "Raymond Hsu has not heard from RSM in 50 days, ahead of the Ridgeline IC.",
      "basis": "Relationship history · Keystone",
      "actLabel": "Draft note",
      "kind": "draft",
      "ref": "c6"
    },
    {
      "id": "r6",
      "text": "Kestrel Bio's board pre-read is still pending for Oct 27.",
      "basis": "Portfolio calendar",
      "actLabel": "Create reminder",
      "kind": "tasks",
      "tasks": [
        {
          "title": "Request Kestrel Bio board pre-read",
          "related": "Kestrel Bio",
          "due": "Oct 22"
        }
      ]
    }
  ],
  "vc": [
    {
      "id": "r7",
      "text": "Corvid diligence is two customer reference calls behind plan.",
      "basis": "Diligence checklist · Corvid Analytics",
      "actLabel": "Create tasks",
      "kind": "tasks",
      "tasks": [
        {
          "title": "Schedule Corvid reference call #5",
          "related": "Corvid Analytics",
          "due": "Oct 21"
        },
        {
          "title": "Schedule Corvid reference call #6",
          "related": "Corvid Analytics",
          "due": "Oct 22"
        }
      ]
    },
    {
      "id": "r8",
      "text": "The Tessellate memo cites a market size that differs from the linked research report (illustrative).",
      "basis": "Tessellate memo · AlphaSense (sample)",
      "actLabel": "Compare sources",
      "kind": "ask",
      "q": "Compare the Tessellate memo market size with the linked research"
    },
    {
      "id": "r9",
      "text": "A thank-you to Jordan Alvarez after today's intro keeps the channel warm.",
      "basis": "Email capture · Oct 12",
      "actLabel": "Draft note",
      "kind": "draft",
      "ref": "a10"
    }
  ]
};

export const DEMO_TEAM: DemoTeamActivity[] = [
  {
    "who": "Tom Becker",
    "tone": 3,
    "what": "logged a call with Priya Raman on Gulf Coast Storage Partnership",
    "when": "2h ago"
  },
  {
    "who": "Aisha Patel",
    "tone": 2,
    "what": "uploaded the Lone Star site-selection memo",
    "when": "Yesterday"
  },
  {
    "who": "Hannah Brooks",
    "tone": 5,
    "what": "moved Corvid Analytics to Due Diligence",
    "when": "Fri"
  },
  {
    "who": "Sofia Marquez",
    "tone": 4,
    "what": "shared the RedSky Phase 1 rollout update",
    "when": "Fri"
  },
  {
    "who": "Marcus Chen",
    "tone": 4,
    "what": "added Halcyon Robotics to the pipeline",
    "when": "Oct 12"
  },
  {
    "who": "Eleanor Vance",
    "tone": 0,
    "what": "approved the Q4 research budget",
    "when": "Oct 9"
  }
];

export const DEMO_NOTIFS: DemoNotification[] = [
  {
    "id": "n1",
    "icon": "chat",
    "text": "Tom Becker mentioned you in Gulf Coast Storage Partnership",
    "time": "12 min ago",
    "go": {
      "kind": "project",
      "id": "p1"
    }
  },
  {
    "id": "n2",
    "icon": "capitol",
    "text": "Committee markup moved to Thu, Oct 22 (illustrative)",
    "time": "1 hr ago",
    "go": {
      "kind": "project",
      "id": "p2"
    }
  },
  {
    "id": "n3",
    "icon": "ai",
    "text": "RedSky AI prepared your brief for Ridgeline × RSM",
    "time": "7:02 AM",
    "ai": true,
    "go": {
      "prep": "m1"
    }
  },
  {
    "id": "n4",
    "icon": "doc",
    "text": "Hannah Brooks shared \"Q3 portfolio letter (final draft)\"",
    "time": "Yesterday",
    "go": {
      "kind": "doc",
      "id": "doc6"
    }
  }
];

export const DEMO_WS_PROFILE: DemoWorkstyleProfile = {
  "disc": [
    {
      "k": "D",
      "name": "Dominance",
      "nat": 72,
      "adp": 68
    },
    {
      "k": "I",
      "name": "Influence",
      "nat": 64,
      "adp": 70
    },
    {
      "k": "S",
      "name": "Steadiness",
      "nat": 38,
      "adp": 42
    },
    {
      "k": "C",
      "name": "Compliance",
      "nat": 45,
      "adp": 52
    }
  ],
  "styleNote": "Natural style leans direct and persuasive; the adapted style shows slightly more structure and people focus at work.",
  "forces": [
    {
      "m": "Knowledge",
      "a": "Instinctive",
      "b": "Intellectual",
      "pos": 55
    },
    {
      "m": "Utility",
      "a": "Selfless",
      "b": "Resourceful",
      "pos": 78
    },
    {
      "m": "Surroundings",
      "a": "Objective",
      "b": "Harmonious",
      "pos": 42
    },
    {
      "m": "Others",
      "a": "Altruistic",
      "b": "Intentional",
      "pos": 70
    },
    {
      "m": "Power",
      "a": "Collaborative",
      "b": "Commanding",
      "pos": 82
    },
    {
      "m": "Methodologies",
      "a": "Structured",
      "b": "Receptive",
      "pos": 72
    }
  ],
  "primary": [
    "Commanding",
    "Resourceful",
    "Receptive",
    "Intentional"
  ],
  "prefs": [
    {
      "k": "Communication",
      "v": "Brief and direct — bottom line first, detail on request.",
      "icon": "chat"
    },
    {
      "k": "Decision-making",
      "v": "Moves quickly once the key facts and trade-offs are clear.",
      "icon": "target"
    },
    {
      "k": "Motivation",
      "v": "Influence, visible results and a good return on time invested.",
      "icon": "flag"
    },
    {
      "k": "Environment",
      "v": "Fast-paced and varied, with room to persuade and freedom from routine detail.",
      "icon": "home"
    }
  ]
};

