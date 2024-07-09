from django.contrib import admin
from django.urls import path
from app_hydro import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    path('execute_query/', views.execute_query, name='execute_query'),
]