//
//  TatnallLegacyApp.swift
//  TatnallLegacy
//
//  Created by Conner malley on 1/4/26.
//

import SwiftUI
import CoreData

@main
struct TatnallLegacyApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
