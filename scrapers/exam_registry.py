"""
ZenZa Universal Exam Sources & Portals Registry
Contains machine-readable metadata, conducting bodies, and official portal URLs for all exam categories.
"""

EXAM_REGISTRY = {
    "Engineering Entrance Exams": [
        {"code": "JEE_MAIN", "name": "JEE Main", "body": "National Testing Agency (NTA)", "url": "https://jeemain.nta.ac.in"},
        {"code": "JEE_ADV", "name": "JEE Advanced", "body": "Zonal IITs", "url": "https://jeeadv.ac.in"},
        {"code": "GATE", "name": "GATE (Post-Grad)", "body": "IISc & IITs", "url": "https://gate2026.iisc.ac.in"},
        {"code": "BITSAT", "name": "BITSAT", "body": "BITS Pilani", "url": "https://bitsadmission.com"},
        {"code": "VITEEE", "name": "VITEEE", "body": "VIT University", "url": "https://viteee.vit.ac.in"},
        {"code": "SRMJEEE", "name": "SRMJEEE", "body": "SRM Institute of Science & Tech", "url": "https://srmist.edu.in"},
    ],
    "Medical Entrance Exams": [
        {"code": "NEET_UG", "name": "NEET UG", "body": "National Testing Agency (NTA)", "url": "https://exams.nta.ac.in/NEET"},
        {"code": "NEET_PG", "name": "NEET PG", "body": "National Board of Examinations (NBE)", "url": "https://natboard.edu.in"},
        {"code": "INICET", "name": "INI-CET", "body": "AIIMS, New Delhi", "url": "https://aiimsexams.ac.in"},
        {"code": "FMGE", "name": "FMGE", "body": "National Board of Examinations", "url": "https://nbe.edu.in"},
        {"code": "AIIMS_NUR", "name": "AIIMS Nursing", "body": "AIIMS, New Delhi", "url": "https://aiimsexams.ac.in"},
    ],
    "Government Recruitment - Central": [
        {"code": "UPSC_CSE", "name": "UPSC Civil Services (IAS)", "body": "Union Public Service Commission", "url": "https://upsc.gov.in"},
        {"code": "SSC_CGL", "name": "SSC CGL / CHSL", "body": "Staff Selection Commission", "url": "https://ssc.gov.in"},
        {"code": "IBPS_PO", "name": "IBPS PO / Clerk", "body": "Inst. of Banking Personnel Selection", "url": "https://ibps.in"},
        {"code": "RBI_GR_B", "name": "RBI Grade B", "body": "Reserve Bank of India", "url": "https://rbi.org.in"},
        {"code": "RRB_NTPC", "name": "RRB NTPC / ALP", "body": "Railway Recruitment Boards", "url": "https://indianrailways.gov.in"},
        {"code": "NDA", "name": "NDA & NA (Defense)", "body": "UPSC", "url": "https://upsc.gov.in"},
        {"code": "CDS", "name": "CDS (Defense)", "body": "UPSC", "url": "https://upsc.gov.in"},
    ],
    "Government Recruitment - MP State": [
        {"code": "MP_POLICE", "name": "MP Police (SI/Constable)", "body": "MP Employees Selection Board (ESB)", "url": "https://esb.mp.gov.in"},
        {"code": "MP_PATWARI", "name": "MP Patwari", "body": "MP Employees Selection Board (ESB)", "url": "https://esb.mp.gov.in"},
        {"code": "MPPSC", "name": "MP PSC (State Service)", "body": "MP Public Service Commission", "url": "https://mppsc.mp.gov.in"},
        {"code": "MP_TET", "name": "MP TET (Varg 1, 2, 3)", "body": "MP Employees Selection Board (ESB)", "url": "https://esb.mp.gov.in"},
        {"code": "MP_FOREST", "name": "MP Forest Guard / Jail Prahari", "body": "MP Employees Selection Board (ESB)", "url": "https://esb.mp.gov.in"},
    ],
    "Central Entrance Exams": [
        {"code": "CUET", "name": "CUET (UG/PG)", "body": "National Testing Agency (NTA)", "url": "https://exams.nta.ac.in/CUET-UG"},
        {"code": "CAT", "name": "CAT (Management)", "body": "IIMs", "url": "https://iimcat.ac.in"},
        {"code": "CLAT", "name": "CLAT (Law)", "body": "Consortium of NLUs", "url": "https://consortiumofnlus.ac.in"},
        {"code": "UGC_NET", "name": "UGC NET", "body": "National Testing Agency (NTA)", "url": "https://ugcnet.nta.ac.in"},
        {"code": "NIFT", "name": "NIFT Entrance", "body": "Nat. Inst. of Fashion Technology", "url": "https://nift.ac.in"},
        {"code": "NID_DAT", "name": "NID DAT", "body": "National Institute of Design", "url": "https://admissions.nid.edu"},
        {"code": "NCHMCT", "name": "NCHMCT JEE", "body": "NTA", "url": "https://nchmjee.nta.nic.in"},
    ]
}
